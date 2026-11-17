/**
 * MiterCourt against a fork of X Layer mainnet: every eval below runs on a real
 * TapeOut processor. No processor mocks, except one etched stand-in that
 * simulates a beacon upgrade (the factory is not sealed).
 */
import hre from 'hardhat';
import { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chai from 'chai';
import { encodeAbiParameters, getAddress, keccak256, parseAbi, parseEther, type Hex } from 'viem';
import { mine, time } from '@nomicfoundation/hardhat-network-helpers';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

chai.use(chaiAsPromised);

const FACTORY = '0x1f09DAeFA827f02CBb40967cc91b259763760761';
// Live circuits found by scripts/miter.ts (2026-11-17):
const AND_4G = { cpu: getAddress('0x87BFCa3494Aa228fF589ab9B642143A5e8c8F9a6'), id: 3522n }; // 2→1 AND, 4 gates
const NAND_A = { cpu: getAddress('0x60918C204F3c94630D3D793738Fc36293c8405D6'), id: 1010n }; // 2→1 NAND, 3 gates
const NAND_B = { cpu: getAddress('0x87BFCa3494Aa228fF589ab9B642143A5e8c8F9a6'), id: 2054n }; // byte-identical to NAND_A
const STATEFUL = { cpu: getAddress('0x87BFCa3494Aa228fF589ab9B642143A5e8c8F9a6'), id: 823n }; // 4→4, 5 latch bits
const COMB_4x4 = { cpu: getAddress('0x87BFCa3494Aa228fF589ab9B642143A5e8c8F9a6'), id: 4465n }; // 4→4 combinational
const COUNTEREXAMPLE: Hex = '0x00'; // AND(0,0)=0, NAND(0,0)=1 (found by MiniSat, confirmed via eval)

const processorAbi = parseAbi([
  'function netlist(uint256 id) view returns (bytes)',
  'function eval(uint256 id, bytes inputs) view returns (bytes)',
]);

const salt = keccak256('0x6d69746572');
const commitmentOf = (id: bigint, input: Hex, hunter: Hex, s: Hex) =>
  keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'bytes' }, { type: 'address' }, { type: 'bytes32' }], [id, input, hunter, s]));

/**
 * Fresh random accounts. Hardhat's well-known dev accounts are EIP-7702-delegated
 * to sweeper contracts on X Layer mainnet (code 0xef0100…), so a fork inherits
 * that code and plain value transfers to them revert. See docs/build-log.md.
 */
async function freshAccount() {
  const address = privateKeyToAccount(generatePrivateKey()).address;
  await hre.network.provider.send('hardhat_impersonateAccount', [address]);
  await hre.network.provider.send('hardhat_setBalance', [address, '0x' + parseEther('100').toString(16)]);
  return hre.viem.getWalletClient(address);
}

async function setup() {
  const [funder, hunter, thief, feeSink] = await Promise.all([freshAccount(), freshAccount(), freshAccount(), freshAccount()]);
  const pub = await hre.viem.getPublicClient();
  const court = await hre.viem.deployContract('MiterCourt', [FACTORY, feeSink.account.address, 500]);
  const expiry = BigInt((await time.latest()) + 3600);
  return { funder, hunter, thief, feeSink, pub, court, expiry };
}

async function openAndVsNand(s: Awaited<ReturnType<typeof setup>>, amount = parseEther('1')) {
  await s.court.write.open([AND_4G.cpu, AND_4G.id, NAND_A.cpu, NAND_A.id, Number(s.expiry)], { value: amount, account: s.funder.account });
  return await s.court.read.bountyCount();
}

describe('MiterCourt on an X Layer mainnet fork', function () {
  it('sanity: the live processors really disagree on the counterexample', async () => {
    const pub = await hre.viem.getPublicClient();
    const a = await pub.readContract({ address: AND_4G.cpu, abi: processorAbi, functionName: 'eval', args: [AND_4G.id, COUNTEREXAMPLE] });
    const b = await pub.readContract({ address: NAND_A.cpu, abi: processorAbi, functionName: 'eval', args: [NAND_A.id, COUNTEREXAMPLE] });
    expect(a).to.equal('0x00');
    expect(b).to.equal('0x01');
  });

  it('opens a bounty and pins both netlist hashes', async () => {
    const s = await setup();
    const id = await openAndVsNand(s);
    const b = await s.court.read.getBounty([id]);
    const tNet = await s.pub.readContract({ address: AND_4G.cpu, abi: processorAbi, functionName: 'netlist', args: [AND_4G.id] });
    expect(b.targetHash).to.equal(keccak256(tNet));
    expect(b.nIn).to.equal(2);
    expect(b.nOut).to.equal(1);
    expect(b.state).to.equal(1); // Open
    const [bonded] = await s.court.read.statusOf([AND_4G.cpu, AND_4G.id, NAND_A.cpu, NAND_A.id]);
    expect(bonded).to.equal(parseEther('1'));
  });

  it('pays the hunter after commit → reveal, re-running both real circuits', async () => {
    const s = await setup();
    const id = await openAndVsNand(s);
    const hunterAddr = s.hunter.account.address;
    await s.court.write.commit([commitmentOf(id, COUNTEREXAMPLE, hunterAddr, salt)], { account: s.hunter.account });
    const before = await s.pub.getBalance({ address: hunterAddr });
    const tx = await s.court.write.reveal([id, COUNTEREXAMPLE, salt], { account: s.hunter.account });
    const rcpt = await s.pub.waitForTransactionReceipt({ hash: tx });
    const after = await s.pub.getBalance({ address: hunterAddr });
    const gas = rcpt.gasUsed * rcpt.effectiveGasPrice;
    expect(after - before + gas).to.equal(parseEther('0.95')); // 5% protocol fee

    const b = await s.court.read.getBounty([id]);
    expect(b.state).to.equal(2); // Paid
    expect(getAddress(b.hunter)).to.equal(getAddress(hunterAddr));
    expect(await s.court.read.counterexampleOf([id])).to.equal(COUNTEREXAMPLE);
    const [bonded, brokenBy] = await s.court.read.statusOf([AND_4G.cpu, AND_4G.id, NAND_A.cpu, NAND_A.id]);
    expect(bonded).to.equal(0n);
    expect(brokenBy).to.equal(id);
    expect(await s.court.read.feesAccrued()).to.equal(parseEther('0.05'));

    await s.court.write.sweepFees();
    expect(await s.court.read.feesAccrued()).to.equal(0n);
    console.log(`      reveal gas used: ${rcpt.gasUsed}`);
  });

  it('rejects a claim when the circuits agree (identical NANDs: no counterexample exists)', async () => {
    const s = await setup();
    await s.court.write.open([NAND_B.cpu, NAND_B.id, NAND_A.cpu, NAND_A.id, Number(s.expiry)], { value: 1n, account: s.funder.account });
    const id = await s.court.read.bountyCount();
    const input: Hex = '0x03';
    await s.court.write.commit([commitmentOf(id, input, s.hunter.account.address, salt)], { account: s.hunter.account });
    await expect(s.court.write.reveal([id, input, salt], { account: s.hunter.account })).to.be.rejectedWith('OutputsAgree');
  });

  it('rejects a wrong-length input', async () => {
    const s = await setup();
    const id = await openAndVsNand(s);
    const input: Hex = '0x0000';
    await s.court.write.commit([commitmentOf(id, input, s.hunter.account.address, salt)], { account: s.hunter.account });
    await expect(s.court.write.reveal([id, input, salt], { account: s.hunter.account })).to.be.rejectedWith('BadInputLength');
  });

  it('refuses a reveal in the same block as its commitment', async () => {
    const s = await setup();
    const id = await openAndVsNand(s);
    await hre.network.provider.send('evm_setAutomine', [false]);
    try {
      await s.court.write.commit([commitmentOf(id, COUNTEREXAMPLE, s.hunter.account.address, salt)], { account: s.hunter.account });
      const revealTx = await s.court.write.reveal([id, COUNTEREXAMPLE, salt], { account: s.hunter.account, gas: 3_000_000n });
      await mine(1);
      const rcpt = await s.pub.waitForTransactionReceipt({ hash: revealTx });
      expect(rcpt.status).to.equal('reverted');
    } finally {
      await hre.network.provider.send('evm_setAutomine', [true]);
    }
    expect((await s.court.read.getBounty([id])).state).to.equal(1);
  });

  it('makes a copied reveal worthless to a front-runner', async () => {
    const s = await setup();
    const id = await openAndVsNand(s);
    await s.court.write.commit([commitmentOf(id, COUNTEREXAMPLE, s.hunter.account.address, salt)], { account: s.hunter.account });
    // thief replays the hunter's reveal calldata from their own address
    await expect(s.court.write.reveal([id, COUNTEREXAMPLE, salt], { account: s.thief.account })).to.be.rejectedWith('UnknownCommitment');
  });

  it('rejects pin mismatches, stateful circuits, identical circuits and non-processors', async () => {
    const s = await setup();
    const open = (t: typeof AND_4G, sp: typeof AND_4G) =>
      s.court.write.open([t.cpu, t.id, sp.cpu, sp.id, Number(s.expiry)], { value: 1n, account: s.funder.account });
    await expect(open(AND_4G, COMB_4x4)).to.be.rejectedWith('PinMismatch');
    await expect(open(STATEFUL, COMB_4x4)).to.be.rejectedWith('Stateful');
    await expect(open(NAND_A, NAND_A)).to.be.rejectedWith('SameCircuit');
    await expect(open({ cpu: s.funder.account.address, id: 1n }, NAND_A)).to.be.rejectedWith('NotProcessor');
  });

  it('voids instead of paying when a netlist changes after open (unsealed factory)', async () => {
    const s = await setup();
    const id = await openAndVsNand(s);
    await s.court.write.commit([commitmentOf(id, COUNTEREXAMPLE, s.hunter.account.address, salt)], { account: s.hunter.account });
    // simulate a beacon upgrade on the spec's processor
    const mutant = await hre.viem.deployContract('MutatedProcessor');
    const code = await s.pub.getCode({ address: mutant.address });
    await hre.network.provider.send('hardhat_setCode', [NAND_A.cpu, code]);
    await s.court.write.reveal([id, COUNTEREXAMPLE, salt], { account: s.hunter.account });
    const b = await s.court.read.getBounty([id]);
    expect(b.state).to.equal(3); // Voided
    const [bonded, brokenBy] = await s.court.read.statusOf([AND_4G.cpu, AND_4G.id, NAND_A.cpu, NAND_A.id]);
    expect(bonded).to.equal(0n);
    expect(brokenBy).to.equal(0n);
    await s.court.write.withdraw([id], { account: s.funder.account }); // funder recovers the stake
    expect((await s.court.read.getBounty([id])).state).to.equal(4);
    await hre.network.provider.send('hardhat_reset', [{ forking: { jsonRpcUrl: (hre.network.config as any).forking.url } }]);
  });

  it('locks the stake until expiry, then lets the funder withdraw', async () => {
    const s = await setup();
    const id = await openAndVsNand(s);
    await expect(s.court.write.withdraw([id], { account: s.funder.account })).to.be.rejectedWith('NotWithdrawable');
    await expect(s.court.write.withdraw([id], { account: s.hunter.account })).to.be.rejectedWith('NotFunder');
    await time.increaseTo(Number(s.expiry) + 1);
    await s.court.write.withdraw([id], { account: s.funder.account });
    expect((await s.court.read.getBounty([id])).state).to.equal(4); // Withdrawn
  });

  it('does not pay twice', async () => {
    const s = await setup();
    const id = await openAndVsNand(s);
    await s.court.write.commit([commitmentOf(id, COUNTEREXAMPLE, s.hunter.account.address, salt)], { account: s.hunter.account });
    await s.court.write.reveal([id, COUNTEREXAMPLE, salt], { account: s.hunter.account });
    const salt2 = keccak256('0x02');
    await s.court.write.commit([commitmentOf(id, COUNTEREXAMPLE, s.thief.account.address, salt2)], { account: s.thief.account });
    await expect(s.court.write.reveal([id, COUNTEREXAMPLE, salt2], { account: s.thief.account })).to.be.rejectedWith('NotOpen');
  });
});
