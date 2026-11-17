// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev Test-only stand-in etched over a real processor's address to simulate a
///      beacon upgrade that changes stored netlists (the TapeOut factory is not sealed).
contract MutatedProcessor {
    function circuitInfo(uint256) external pure returns (uint32, uint32, uint32, uint32) {
        return (2, 1, 0, 4);
    }

    function netlist(uint256) external pure returns (bytes memory) {
        return hex"00000002000003"; // a different single NAND
    }

    function eval(uint256, bytes calldata) external pure returns (bytes memory) {
        return hex"01";
    }
}
