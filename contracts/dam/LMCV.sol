// SPDX-License-Identifier: AGPL-3.0-or-later

/// LMCV.sol -- dPrime CDP database

// - `wad`: fixed point decimal with 18 decimals (for basic quantities, e.g. balances)
// - `ray`: fixed point decimal with 27 decimals (for precise quantites, e.g. ratios)
// - `rad`: fixed point decimal with 45 decimals (result of integer multiplication with a `wad` and a `ray`)

pragma solidity 0.8.9;

contract LMCV {
    mapping (address => uint256) public admin;

    mapping (address => mapping (address => uint256))    public proxyApprovals;

    struct CollateralType {
        uint256 spotPrice;          // [ray]
        uint256 totalDebt;          // [wad]
        uint256 debtCeiling;        // [rad] - Protocol Level
        uint256 debtFloor;          // [rad] - Account level
        uint256 debtMult;           // [ray] - ie. max 70% loaned out as dPrime
        uint256 liqBonusMult;       // [ray] - ie. 5% for bluechip, 15% for junk
    }

    //TODO:acceptCollateral() 
    bytes32[] public CollateralList;
    mapping (bytes32 => CollateralType)                 public CollateralTypes;

    //CDP
    mapping (address => mapping (bytes32 => uint256))   public lockedCollateral;    // [wad]
    mapping (address => mapping (bytes32 => uint256))   public unlockedCollateral;  // [wad]
    mapping (address => uint256)                        public lockedDPrime;        // [rad]
    mapping (address => bytes32[])                      public lockedCollateralList;

    //TODO: Appropriate getters and setters
    uint256 public live;
    uint256 public ProtocolDebt;           // [rad]
    uint256 public ProtocolDebtCeiling; // [rad]
    uint256 public mintFee;             // [ray]
    address public feeTaker;

    //Liquidation
    mapping (address => uint256)    public liqDPrime; // [rad] dPrime useable in liquidations
    mapping (address => bool)       public userLock;
    //TODO: Appropriate getters and setters
    //Both partialLiqPerc & repaymentFeePerc need to be closely related to determine fee structure
    uint256 public partialLiqMax;              // [ray] ie. 50% of maxDPrime value of account collateral
    uint256 public protocolLiqFeeMult;          // [ray] 0.125 * dPrime paid in
    uint256 public liquidationMult;             // [ray] ie. user at 80% dPrime/collateral ratio -> liquidate
    uint256 public liquidiationFloor;           // [rad] user debt below certain amount, liquidate entire portfolio
    // uint256 public maxAccountDebt;              // [rad] so that liquidations don't get too big


    // --- Events ---
    event ModifyCollateral(bytes32 indexed collat, address indexed user, int256 wad);
    event MoveCollateral(bytes32 indexed collat, address indexed src, address indexed dst, uint256 wad);
    event ModifyDPrime(address indexed src, address indexed dst, uint256 rad);
    event MovePortfolio(address indexed src, address indexed dst);
    event Loan(uint256 indexed dPrimeChange, address indexed user);
    event Liquidation(address indexed liquidated, address indexed liquidator, uint256 percentage);



    //Edit for types of auth 
    //- keep modules separate and only let their respective functions access them
    modifier auth() {
        require(admin[msg.sender] == 1, "LMCV/Not Authorized");
        _;
    }

    modifier alive() {
        require(live == 1, "LMCV/paused");
        _;
    }

    function approval(address bit, address user) internal view returns (bool) {
        return either(bit == user, proxyApprovals[bit][user] == 1);
    }

    constructor() {
        live = 1;
        admin[msg.sender] = 1;
    }

    // --- Allowance ---
    function proxyApprove(address user) external {
        proxyApprovals[msg.sender][user] = 1;
    }

    function proxyDisapprove(address user) external {
        proxyApprovals[msg.sender][user] = 0;
    }

    // --- Math ---
    uint256 constant RAY = 10 ** 27;
    function _add(uint256 x, int256 y) internal pure returns (uint256 z) {
        unchecked {
            z = x + uint256(y);
        }
        require(y >= 0 || z <= x);
        require(y <= 0 || z >= x);
    }

    function _sub(uint256 x, int256 y) internal pure returns (uint256 z) {
        unchecked {
            z = x - uint256(y);
        }
        require(y <= 0 || z <= x);
        require(y >= 0 || z >= x);
    }


    // Can only be used sensibly with the following combination of units:
    // - `rmul(wad, ray) -> wad`
    // - `rmul(ray, ray) -> ray`
    // - `rmul(rad, ray) -> rad`

    function _rmul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = x * y;
        require(y == 0 || z / y == x);
        z = z / RAY;
    }

    
    // --- Fungibility ---
    //TODO: Test
    function modifyCollateral(bytes32 collat, address user, int256 wad) external auth {
        unlockedCollateral[user][collat] = _add(unlockedCollateral[user][collat], wad);
        emit ModifyCollateral(collat, user, wad);
    }

    //TODO: Test
    function modifyDPrime(address src, address dst, uint256 rad) external {
        require(approval(src, msg.sender), "LMCV/not allowed");
        lockedDPrime[src] = lockedDPrime[src] - rad;
        lockedDPrime[dst] = lockedDPrime[dst] + rad;
        emit ModifyDPrime(src, dst, rad);
    }

    //TODO: Test
    function moveCollateral(bytes32 collat, address src, address dst, uint256 wad) external {
        require(approval(src, msg.sender), "LMCV/not allowed");
        unlockedCollateral[src][collat] = unlockedCollateral[src][collat] - wad;
        unlockedCollateral[dst][collat] = unlockedCollateral[dst][collat] + wad;
        emit MoveCollateral(collat, src, dst, wad);
    }

    //TODO: Test
    // function movePortfolio(address src, address dst) external {
    //     require(approval(src, msg.sender), "LMCV/not-allowed");
    //     for(uint256 i = 0; i < portfolioCollateralTokens[src].length; i++){
    //         bytes32 collat = portfolioCollateralTokens[src][i];

    //         uint256 carryover = unlockedCollateral[src][collat];
    //         unlockedCollateral[src][collat] = 0;
    //         unlockedCollateral[dst][collat] = unlockedCollateral[dst][collat] + carryover;
    //     }
    //     emit MovePortfolio(src, dst);
    // }


    //All collaterals linked together to be more portfolio centric
    //eg: measure of whether a vault is safe or not is done based on
    //the vault as a whole being overcollateralized properly
    function loan(
        bytes32[] memory collats,           // [wad]
        uint256[] memory collateralChange,  // [wad]
        uint256 dPrimeChange,               // [wad]
        address user
    ) external alive {
        require(collats.length == collateralChange.length, "LMCV/Need amount for each collateral");
        require(approval(user, msg.sender), "LMCV/Owner must consent");

        //Locks up all collateral
        for(uint256 i = 0; i < collats.length; i++){
            CollateralType memory collateralType = CollateralTypes[collats[i]];
            require(collateralType.debtCeiling > 0 && collateralType.debtMult != 0, "LMCV/collateral type not initialized");

            //if collateral is newly introduced to cdp
            //add it to the locked collateral list
            if(lockedCollateral[user][collats[i]] == 0){
                lockedCollateralList[user].push(collats[i]);
            }

            uint256 newLockedCollat = lockedCollateral[user][collats[i]];
            uint256 newUnlockedCollat = unlockedCollateral[user][collats[i]];

            //Change from unlocked collateral to locked collateral
            newUnlockedCollat = newUnlockedCollat - collateralChange[i];
            newLockedCollat = newLockedCollat + collateralChange[i];

            require(newLockedCollat > collateralType.debtFloor, "LMCV/Collateral must be higher than dust level");

            collateralType.totalDebt = collateralType.totalDebt + newLockedCollat;
            require(collateralType.debtCeiling > collateralType.totalDebt, "LMCV/Debt ceiling exceeded");

            //Set new collateral numbers
            CollateralTypes[collats[i]] = collateralType;
            lockedCollateral[user][collats[i]] = newLockedCollat;
            unlockedCollateral[user][collats[i]] = newUnlockedCollat;
        }

        //Calculate dPrime
        uint256 maxDPrime;      // [rad]
        bytes32[] storage lockedList = lockedCollateralList[user];
        for(uint256 i = 0; i < lockedList.length; i++){
            //Don't modify collateralType
            CollateralType storage collateralType = CollateralTypes[lockedList[i]];

            //TODO: Change to > debtFloor then unlock the collateral
            if(lockedCollateral[user][lockedList[i]] > 0){
                uint256 value = lockedCollateral[user][lockedList[i]] * collateralType.spotPrice; // wad*ray -> rad
                maxDPrime = maxDPrime + _rmul(value, collateralType.debtMult); // rmul(rad, ray) -> rad
            }else{
                deleteElement(lockedList, i);
            }
        }

        require(dPrimeChange < maxDPrime, "LMCV/Minting more dPrime than allowed");
        // require(dPrimeChange < maxAccountDebt, "LMCV/Higher than allowed debt");

        ProtocolDebt = ProtocolDebt + maxDPrime;
        require(ProtocolDebt < ProtocolDebtCeiling, "LMCV/Cannot extend past protocol debt ceiling");

        //Last thing that happens is actual ability to mint dPrime
        lockedDPrime[user] = lockedDPrime[user] + dPrimeChange;
        emit Loan(lockedDPrime[user], user);
    }

    //Repay any percentage of the loan and unlock collateral
    //Or repay none if overcollateralized properly
    function repay(
        bytes32[] memory collats, 
        address user,
        int256[] memory collateralChange, 
        int256 dPrimeChange
    ) external alive {

    }

    //Coin prices increase and they want to take out more without changing collateral
    //Or coin prices decrease and they want to repay dPrime
    //TODO: Refactor out loan maxDPrime calc to also be used in this function
    function modifyLoan(address user, int256 dPrimeChange) external {
        require(approval(user, msg.sender), "LMCV/Owner must consent");

    }

    

    //Like grab
    //Will liquidate half of entire portfolio to regain healthy portfolio status
    //until the portfolio is too small to be split, in which case it liquidates
    //the entire portfolio - large accounts could liquidate many times
    function liquidate(
        address liquidated, 
        address liquidator, 
        uint256 percentage // [ray]
    ) external auth { 
        uint256 totalValue = _getMaxDPrime(liquidated); // [rad]
        require(!_isHealthy(liquidated, totalValue), "LMCV/Vault is healthy");

        // uint256 liquidationRatio = totalValue * partialLiqPercentage / lockedDPrime[liquidated]; // [ray]
        // if( > )

        //Check if beneath debtFloor or debt/loan > 81%
        uint256 percentAllowed = partialLiqMax;
        if(_rmul(lockedDPrime[liquidated], partialLiqMax) < liquidiationFloor){
            percentAllowed = RAY; //100% of dPrime value from collateral
        }
        if(lockedDPrime[liquidated] * 100 / totalValue > 82){
            percentAllowed = RAY; //100% of dPrime value from collateral
        }
        if(percentage > percentAllowed){
            percentage = percentAllowed;
        }

        uint256 repaymentValue = _rmul(lockedDPrime[liquidated], percentage); // [rad]
        //take dPrime from liquidator
        liqDPrime[liquidator] = liqDPrime[liquidator] - repaymentValue;

        //Move collateral to liquidator's address
        for(uint256 i = 0; i < lockedCollateralList[liquidated].length; i++){
            bytes32 collateral = lockedCollateralList[liquidated][i];
            uint256 lockedAmount = lockedCollateral[liquidated][collateral]; // [wad]
            uint256 liquidationAmount =  _rmul(lockedAmount,(percentage + CollateralTypes[collateral].liqBonusMult)); // [wad]

            lockedAmount = lockedAmount - liquidationAmount;
            lockedCollateral[liquidated][collateral] = lockedAmount;
            unlockedCollateral[liquidator][collateral] = unlockedCollateral[liquidator][collateral] + liquidationAmount;
        }

        //take fee
        uint256 protocolLiqFee = _rmul(repaymentValue, protocolLiqFeeMult);
        repaymentValue = repaymentValue - protocolLiqFee;
        lockedDPrime[feeTaker] = lockedDPrime[feeTaker] + protocolLiqFee;

        //remove debt from protocol
        ProtocolDebt = ProtocolDebt - repaymentValue;

        //repay liquidated's debt
        lockedDPrime[liquidated] = lockedDPrime[liquidated] - repaymentValue;
        emit Liquidation(liquidated, liquidator, percentage);
    }

    //Move these functions to liquidation contract
    function isHealthy(address user) external view returns (bool health){
        return _isHealthy(user, _getMaxDPrime(user));
    }

    function _isHealthy(address user, uint256 maxDPrime) internal view returns (bool health) { 
        if(_rmul(maxDPrime, liquidationMult) > lockedDPrime[user]){
            return true;
        }
        return false;
    }

    function getMaxDPrime(address user) external view returns (uint256 maxDPrime) { // [rad] 
        return _getMaxDPrime(user);
    }

    function _getMaxDPrime(address user) internal view returns (uint256 maxDPrime) { // [rad]
        bytes32[] storage lockedList = lockedCollateralList[user];
        for(uint256 i = 0; i < lockedList.length; i++){
            //Don't modify collateralType
            CollateralType storage collateralType = CollateralTypes[lockedList[i]];

            if(lockedCollateral[user][lockedList[i]] > collateralType.debtFloor){
                uint256 value = lockedCollateral[user][lockedList[i]] * collateralType.spotPrice; // wad*ray -> rad
                maxDPrime = maxDPrime + _rmul(value, collateralType.debtMult); // rmul(rad, ray) -> rad
            }
        }
        return maxDPrime;
    }

    function either(bool x, bool y) internal pure returns (bool z) {
        assembly{ z := or(x, y)}
    }

    function both(bool x, bool y) internal pure returns (bool z) {
        assembly{ z := and(x, y)}
    }

    //WARNING: Does not care about order
    function deleteElement(bytes32[] storage array, uint256 i) internal {
        require(i < array.length, "Array out of bounds");
        array[i] = array[array.length-1];
        array.pop();
    }
}
