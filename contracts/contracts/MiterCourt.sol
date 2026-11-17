// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ITapeOutProcessor, ITapeOutFactory} from "./ITapeOut.sol";

/// @title MiterCourt — correctness bounties for TapeOut circuits that need no judge.
/// @notice A funder stakes OKB that a target circuit computes the same function as a
///         spec circuit. Anyone who reveals an input on which the two disagree is paid,
///         after this contract re-runs both circuits on their real processors via `eval`.
///         No owner, no upgrades, no admin path to the escrow.
/// @dev    Unaudited. Intended for demo-sized stakes.
contract MiterCourt {
    enum State { None, Open, Paid, Voided, Withdrawn }

    struct Bounty {
        address funder;
        uint96 amount;
        address target;
        uint64 targetId;
        address spec;
        uint64 specId;
        bytes32 targetHash; // keccak256(netlist) pinned at open
        bytes32 specHash;
        uint32 nIn;
        uint32 nOut;
        uint40 expiry;
        State state;
        address hunter;
    }

    ITapeOutFactory public immutable factory;
    address public immutable feeRecipient;
    uint16 public immutable feeBps;

    uint256 public constant MIN_DURATION = 10 minutes;
    uint256 public constant MIN_COMMIT_AGE = 1; // blocks between commit and reveal

    uint256 public bountyCount;
    uint256 public feesAccrued;
    mapping(uint256 => Bounty) internal _bounties;
    mapping(uint256 => bytes) public counterexampleOf;
    mapping(bytes32 => uint256) public commitBlock;
    /// @notice Total open stake behind a circuit, keyed by circuitKey(cpu, id).
    mapping(bytes32 => uint256) public bondedOf;
    /// @notice First bounty that broke `target` against `spec`, keyed by pairKey. 0 = never broken.
    mapping(bytes32 => uint256) public brokenAgainst;

    event BountyOpened(
        uint256 indexed id, address indexed funder, address target, uint64 targetId,
        address spec, uint64 specId, uint256 amount, uint40 expiry, bytes32 targetHash, bytes32 specHash
    );
    event Committed(bytes32 indexed commitment, address indexed hunter, uint256 blockNumber);
    event Claimed(
        uint256 indexed id, address indexed hunter, bytes input, bytes targetOut, bytes specOut, uint256 paid, uint256 fee
    );
    event CircuitBroken(address indexed target, uint64 indexed targetId, address spec, uint64 specId, uint256 bountyId);
    event Voided(uint256 indexed id, bytes32 targetHashNow, bytes32 specHashNow);
    event Withdrawn(uint256 indexed id, address indexed funder, uint256 amount);

    error NotProcessor(address cpu);
    error PinMismatch();
    error Stateful();
    error SameCircuit();
    error BadStake();
    error BadExpiry();
    error NotOpen();
    error AlreadyCommitted();
    error CommitTooFresh();
    error UnknownCommitment();
    error BadInputLength();
    error OutputsAgree();
    error NotFunder();
    error NotWithdrawable();
    error TransferFailed();

    constructor(ITapeOutFactory _factory, address _feeRecipient, uint16 _feeBps) {
        require(_feeBps <= 1000, "fee > 10%");
        factory = _factory;
        feeRecipient = _feeRecipient;
        feeBps = _feeBps;
    }

    // ------------------------------------------------------------------ views

    function circuitKey(address cpu, uint64 id) public pure returns (bytes32) {
        return keccak256(abi.encode(cpu, id));
    }

    function pairKey(address target, uint64 targetId, address spec, uint64 specId) public pure returns (bytes32) {
        return keccak256(abi.encode(target, targetId, spec, specId));
    }

    function commitmentOf(uint256 id, bytes calldata input, address hunter, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(id, input, hunter, salt));
    }

    function getBounty(uint256 id) external view returns (Bounty memory) {
        return _bounties[id];
    }

    function netlistHash(address cpu, uint64 id) public view returns (bytes32) {
        return keccak256(ITapeOutProcessor(cpu).netlist(id));
    }

    /// @notice Bounded stake on a circuit, and whether it has been broken against `spec`.
    function statusOf(address target, uint64 targetId, address spec, uint64 specId)
        external view returns (uint256 bonded, uint256 brokenByBounty)
    {
        return (bondedOf[circuitKey(target, targetId)], brokenAgainst[pairKey(target, targetId, spec, specId)]);
    }

    // --------------------------------------------------------------- funding

    /// @notice Stake msg.value that `target` equals `spec` on every input, until `expiry`.
    function open(address target, uint64 targetId, address spec, uint64 specId, uint40 expiry)
        external payable returns (uint256 id)
    {
        if (msg.value == 0 || msg.value > type(uint96).max) revert BadStake();
        if (expiry < block.timestamp + MIN_DURATION) revert BadExpiry();
        (uint32 nIn, uint32 nOut) = _checkPair(target, targetId, spec, specId);

        id = ++bountyCount;
        Bounty storage b = _bounties[id];
        b.funder = msg.sender;
        b.amount = uint96(msg.value);
        b.target = target;
        b.targetId = targetId;
        b.spec = spec;
        b.specId = specId;
        b.targetHash = netlistHash(target, targetId);
        b.specHash = netlistHash(spec, specId);
        b.nIn = nIn;
        b.nOut = nOut;
        b.expiry = expiry;
        b.state = State.Open;
        bondedOf[circuitKey(target, targetId)] += msg.value;
        _emitOpened(id, b);
    }

    function _checkPair(address target, uint64 targetId, address spec, uint64 specId)
        private view returns (uint32 nIn, uint32 nOut)
    {
        if (target == spec && targetId == specId) revert SameCircuit();
        if (!factory.isCPU(target)) revert NotProcessor(target);
        if (!factory.isCPU(spec)) revert NotProcessor(spec);
        (uint32 tIn, uint32 tOut, uint32 tState,) = ITapeOutProcessor(target).circuitInfo(targetId);
        (uint32 sIn, uint32 sOut, uint32 sState,) = ITapeOutProcessor(spec).circuitInfo(specId);
        if (tIn != sIn || tOut != sOut) revert PinMismatch();
        if (tState != 0 || sState != 0) revert Stateful();
        return (tIn, tOut);
    }

    function _emitOpened(uint256 id, Bounty storage b) private {
        emit BountyOpened(
            id, b.funder, b.target, b.targetId, b.spec, b.specId, b.amount, b.expiry, b.targetHash, b.specHash
        );
    }

    /// @notice Funder reclaims an unbroken stake after expiry, or a voided one at any time.
    function withdraw(uint256 id) external {
        Bounty storage b = _bounties[id];
        if (b.funder != msg.sender) revert NotFunder();
        bool expired = b.state == State.Open && block.timestamp > b.expiry;
        if (!expired && b.state != State.Voided) revert NotWithdrawable();
        if (expired) bondedOf[circuitKey(b.target, b.targetId)] -= b.amount;
        b.state = State.Withdrawn;
        uint256 amount = b.amount;
        emit Withdrawn(id, msg.sender, amount);
        _send(msg.sender, amount);
    }

    // ------------------------------------------------------------- claiming

    /// @notice Step 1: commit to keccak256(abi.encode(id, input, msg.sender, salt)).
    /// @dev Binding the hunter's address means a copied reveal is worthless to anyone else.
    function commit(bytes32 commitment) external {
        if (commitBlock[commitment] != 0) revert AlreadyCommitted();
        commitBlock[commitment] = block.number;
        emit Committed(commitment, msg.sender, block.number);
    }

    /// @notice Step 2 (a later block): reveal the input. The contract evaluates both
    ///         circuits on their processors and pays if the outputs differ.
    function reveal(uint256 id, bytes calldata input, bytes32 salt) external {
        Bounty storage b = _bounties[id];
        if (b.state != State.Open) revert NotOpen();
        _consumeCommitment(commitmentOf(id, input, msg.sender, salt));
        if (input.length != (uint256(b.nIn) + 7) / 8) revert BadInputLength();
        if (_voidIfMutated(id, b)) return;

        bytes memory tOut = ITapeOutProcessor(b.target).eval(b.targetId, input);
        bytes memory sOut = ITapeOutProcessor(b.spec).eval(b.specId, input);
        if (keccak256(tOut) == keccak256(sOut)) revert OutputsAgree();

        _settle(id, b, input, tOut, sOut);
    }

    function _consumeCommitment(bytes32 c) private {
        uint256 cb = commitBlock[c];
        if (cb == 0) revert UnknownCommitment();
        if (block.number < cb + MIN_COMMIT_AGE) revert CommitTooFresh();
        delete commitBlock[c];
    }

    /// @dev The factory is not sealed: if either netlist changed since open, the bond no
    ///      longer refers to the logic it was posted on. Void instead of judging.
    function _voidIfMutated(uint256 id, Bounty storage b) private returns (bool) {
        bytes32 tNow = netlistHash(b.target, b.targetId);
        bytes32 sNow = netlistHash(b.spec, b.specId);
        if (tNow == b.targetHash && sNow == b.specHash) return false;
        b.state = State.Voided;
        bondedOf[circuitKey(b.target, b.targetId)] -= b.amount;
        emit Voided(id, tNow, sNow);
        return true;
    }

    function _settle(uint256 id, Bounty storage b, bytes calldata input, bytes memory tOut, bytes memory sOut)
        private
    {
        uint256 amount = b.amount;
        uint256 fee = (amount * feeBps) / 10_000;
        b.state = State.Paid;
        b.hunter = msg.sender;
        counterexampleOf[id] = input;
        bondedOf[circuitKey(b.target, b.targetId)] -= amount;
        bytes32 pk = pairKey(b.target, b.targetId, b.spec, b.specId);
        if (brokenAgainst[pk] == 0) brokenAgainst[pk] = id;
        feesAccrued += fee;

        emit Claimed(id, msg.sender, input, tOut, sOut, amount - fee, fee);
        emit CircuitBroken(b.target, b.targetId, b.spec, b.specId, id);
        _send(msg.sender, amount - fee);
    }

    /// @notice Anyone may push accrued protocol fees to the fixed recipient.
    function sweepFees() external {
        uint256 f = feesAccrued;
        feesAccrued = 0;
        _send(feeRecipient, f);
    }

    function _send(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
