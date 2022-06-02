// SPDX-License-Identifier: AGPL-3.0-or-later

/// LMCV.sol -- dPrime CDP database

// - `wad`: fixed point decimal with 18 decimals (for basic quantities, e.g. balances)
// - `ray`: fixed point decimal with 27 decimals (for precise quantites, e.g. ratios)
// - `rad`: fixed point decimal with 45 decimals (result of integer multiplication with a `wad` and a `ray`)

pragma solidity 0.8.14;

import "hardhat/console.sol";

contract LMCV {
    mapping (address => uint256) public admins;

    //TODO: In coordination with separate of admin powers
    // mapping (bytes32 => address) public CollateralContractAdmins;
    // mapping (bytes32 => address) public spotPriceContractAdmins;

    mapping (address => mapping (address => uint256))    public proxyApprovals;

    struct CollateralType {
        uint256 spotPrice;          // [ray] - ratio of dPrime per unit of collateral
        uint256 totalDebt;          // [wad]
        uint256 debtCeiling;        // [wad] - Protocol Level
        uint256 debtFloor;          // [wad] - Account level
        uint256 debtMult;           // [ray] - ie. max 70% loaned out as dPrime
        uint256 liqBonusMult;       // [ray] - ie. 5% for bluechip, 15% for junk
    }

    //TODO:acceptCollateral() 
    bytes32[] public CollateralList;
    mapping (bytes32 => CollateralType)                 public CollateralTypes;

    //CDP
    mapping (address => bytes32[])                      public lockedCollateralList;
    mapping (address => mapping (bytes32 => uint256))   public lockedCollateral;    // [wad]
    mapping (address => mapping (bytes32 => uint256))   public unlockedCollateral;  // [wad]
    mapping (address => uint256)                        public debtDPrime;          // [rad]
    mapping (address => uint256)                        public withdrawnDPrime;     // [rad]

    //TODO: Appropriate getters and setters
    uint256 public loanLive;
    uint256 public liqLive;
    uint256 public ProtocolDebt;        // [rad]
    uint256 public ProtocolDebtCeiling; // [rad]
    uint256 public mintFee;             // [ray]
    address public feeTaker;

    //Liquidation
    mapping (address => uint256)    public liqDPrime; // [rad] dPrime useable in liquidations
    //TODO: Appropriate getters and setters
    uint256 public partialLiqMax;               // [ray] ie. 50% of maxDPrime value of account collateral
    uint256 public protocolLiqFeeMult;          // [ray] 0.125 * dPrime paid in
    uint256 public liquidationMult;             // [ray] ie. user at 80% dPrime/collateral ratio -> liquidate
    uint256 public wholeCDPLiqMult;             // [ray] above this percentage, whole cdp can be liquidated
    uint256 public liquidiationFloor;           // [rad] user debt below certain amount, liquidate entire portfolio


    // --- Events ---
    event EditAcceptedCollateralType(bytes32 indexed collateralName, uint256 _debtCeiling, uint256 _debtFloor, uint256 _debtMult, uint256 _liqBonusMult);
    event LoanRepayment(uint256 indexed dPrimeChange, address indexed user, bytes32[] collats, uint256[] amounts);
    event Loan(uint256 indexed dPrimeChange, address indexed user, bytes32[] collats, uint256[] amounts);
    event MoveCollateral(bytes32 indexed collat, address indexed src, address indexed dst, uint256 wad);
    event Liquidation(address indexed liquidated, address indexed liquidator, uint256 percentage);
    event ModifyCollateral(bytes32 indexed collat, address indexed user, int256 wad);
    event MovePortfolio(address indexed src, address indexed dst);
    event SpotUpdate(bytes32 indexed collateral, uint256 spot);
    event AddLoanedDPrime(address indexed user, uint256 rad);
    event PushDPrime(address indexed src, uint256 rad);
    event PullDPrime(address indexed src, uint256 rad);


    //Edit for types of auth 
    //- keep modules separate and only let their respective functions access them
    modifier auth() {
        require(admins[msg.sender] == 1, "LMCV/Not Authorized");
        _;
    }

    //// Future idea for collateral only having auth for itself
    // modifier collatAuth(bytes32 collat, address collateralJoin) {
    //     require(CollateralContracts[collat]  == collateralJoin, "Not collateral admin");
    //     _;
    // }

    modifier loanAlive() {
        require(loanLive == 1, "LMCV/Loan paused");
        _;
    }

    modifier liqAlive() {
        require(liqLive == 1, "LMCV/Liquidations paused");
        _;
    }

    constructor() {
        loanLive = 1;
        liqLive = 1;
        admins[msg.sender] = 1;
    }

    function administrate(address admin, uint256 authorization) external auth {
        admins[admin] = authorization;
    }

    // --- Allowance ---
    function proxyApprove(address user) external {
        proxyApprovals[msg.sender][user] = 1;
    }

    function proxyDisapprove(address user) external {
        proxyApprovals[msg.sender][user] = 0;
    }

    function approval(address bit, address user) internal view returns (bool) {
        return either(bit == user, proxyApprovals[bit][user] == 1);
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

    // Can only be used sensibly with the following combination of units:
    // - `rmul(wad, ray) -> wad`
    // - `rmul(ray, ray) -> ray`
    // - `rmul(rad, ray) -> rad`
    function _rmul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = x * y;
        require(y == 0 || z / y == x);
        z = z / RAY;
    }

    // --- Protocol Admin ---
    //TODO: loanAlive,liqAlive,mintFee,feeTaker


    function setProtocolDebtCeiling(uint256 rad) external auth {
        ProtocolDebtCeiling = rad;
    }

    // --- Liquidation Admin ---
    function setPartialLiqMax(uint256 ray) external auth {
        partialLiqMax = ray;
    }

    function setProtocolLiqFeeMult(uint256 ray) external auth {
        protocolLiqFeeMult = ray;
    }

    function setLiquidationMult(uint256 ray) external auth {
        liquidationMult = ray;
    }

    function setLiquidationFloor(uint256 rad) external auth {
        liquidiationFloor = rad;
    }

    function setWholeCDPLiqMult(uint256 ray) external auth {
        wholeCDPLiqMult = ray;
    }

    // --- Collateral Admin ---
    function collatDebtCeiling(bytes32 collateral, uint256 wad) external auth {
        CollateralTypes[collateral].debtCeiling = wad;
    }

    function collatDebtFloor(bytes32 collateral, uint256 wad) external auth {
        CollateralTypes[collateral].debtFloor = wad;
    }

    function collatDebtMult(bytes32 collateral, uint256 ray) external auth {
        CollateralTypes[collateral].debtMult = ray;
    }

    function collatLiqBonusMult(bytes32 collateral, uint256 ray) external auth {
        CollateralTypes[collateral].liqBonusMult = ray;
    }

    function updateSpotPrice(bytes32 collateral, uint256 ray) external auth {
        CollateralTypes[collateral].spotPrice = ray;
        emit SpotUpdate(collateral, ray);
    }

    function editCollateralList(bytes32 collateralName, bool accepted, uint256 position) external auth {
        if(accepted){
            CollateralList.push(collateralName);
        }else{
            deleteElement(CollateralList, position);
        }
    }

    function editAcceptedCollateralType(
        bytes32 collateralName,
        uint256 _debtCeiling,       // [wad] - Protocol Level
        uint256 _debtFloor,         // [wad] - Account level
        uint256 _debtMult,          // [ray] - ie. max 70% loaned out as dPrime
        uint256 _liqBonusMult       // [ray] - ie. 5% for bluechip, 15% for junk
    ) external auth {
        CollateralType memory collateralType = CollateralTypes[collateralName];
        collateralType.debtCeiling = _debtCeiling;
        collateralType.debtFloor = _debtFloor;
        collateralType.debtMult = _debtMult;
        collateralType.liqBonusMult = _liqBonusMult;

        CollateralTypes[collateralName] = collateralType;
        emit EditAcceptedCollateralType(collateralName, _debtCeiling, _debtFloor, _debtMult, _liqBonusMult);
    }

    // --- Fungibility ---
    //TODO: Test
    function modifyCollateral(bytes32 collat, address user, int256 wad) external auth {
        unlockedCollateral[user][collat] = _add(unlockedCollateral[user][collat], wad);
        emit ModifyCollateral(collat, user, wad);
    }

    function pushDPrime(address src, uint256 rad) external auth {
        withdrawnDPrime[src] -= rad;
        emit PushDPrime(src, rad);
    }

    function pullDPrime(address src, uint256 rad) external auth {
        require((withdrawnDPrime[src] + rad) <= debtDPrime[src], "LMCV/Cannot withdraw more dPrime than debt allows");
        withdrawnDPrime[src] += rad;
        emit PullDPrime(src, rad);
    }

    //TODO: Test
    function moveCollateral(bytes32 collat, address src, address dst, uint256 wad) external {
        require(approval(src, msg.sender), "LMCV/not allowed");
        unlockedCollateral[src][collat] = unlockedCollateral[src][collat] - wad;
        unlockedCollateral[dst][collat] = unlockedCollateral[dst][collat] + wad;
        emit MoveCollateral(collat, src, dst, wad);
    }

    //TODO: Test
    function modifyLiquidationDPrime(address user, int256 rad) external auth {
        liqDPrime[user] = _add(liqDPrime[user], rad);
        //TODO: Emit
    }

    //All collaterals linked together to be more portfolio centric
    //eg: measure of whether a vault is safe or not is done based on
    //the vault as a whole being overcollateralized properly
    function loan(
        bytes32[] memory collats,           // [wad]
        uint256[] memory collateralChange,  // [wad]
        uint256 dPrimeChange,               // [wad]
        address user
    ) external loanAlive {
        require(collats.length == collateralChange.length, "LMCV/Need amount for each collateral");
        require(approval(user, msg.sender), "LMCV/Owner must consent");
        dPrimeChange = dPrimeChange * RAY;

        //Locks up all collateral
        for(uint256 i = 0; i < collats.length; i++){
            CollateralType memory collateralType = CollateralTypes[collats[i]];
            require(collateralType.debtCeiling > 0 && collateralType.debtMult != 0, "LMCV/collateral type not initialized");

            //if collateral is newly introduced to cdp
            //add it to the locked collateral listx
            if(lockedCollateral[user][collats[i]] == 0){
                lockedCollateralList[user].push(collats[i]);
            }

            uint256 newLockedCollat = lockedCollateral[user][collats[i]];
            uint256 newUnlockedCollat = unlockedCollateral[user][collats[i]];

            //Change from unlocked collateral to locked collateral
            newUnlockedCollat -= collateralChange[i];
            newLockedCollat += collateralChange[i];

            require(newLockedCollat > collateralType.debtFloor, "LMCV/Collateral must be higher than dust level");

            collateralType.totalDebt += collateralChange[i];
            require(collateralType.debtCeiling > collateralType.totalDebt, "LMCV/Collateral debt ceiling exceeded");

            //Set new collateral numbers
            CollateralTypes[collats[i]] = collateralType;
            lockedCollateral[user][collats[i]] = newLockedCollat;
            unlockedCollateral[user][collats[i]] = newUnlockedCollat;
        }
        
        require(_getMaxDPrime(user) >= (dPrimeChange + debtDPrime[user]), "LMCV/Minting more dPrime than allowed");

        ProtocolDebt += dPrimeChange;
        require(ProtocolDebt < ProtocolDebtCeiling, "LMCV/Cannot extend past protocol debt ceiling");

        //Last thing that happens is actual ability to mint dPrime
        debtDPrime[user] += dPrimeChange;
        emit Loan(debtDPrime[user], user, collats, collateralChange);
    }

    //Repay any percentage of the loan and unlock collateral
    //Or repay none if overcollateralized properly
    function repay(
        bytes32[] memory collats, 
        uint256[] memory collateralChange, 
        uint256 dPrimeChange,
        address user
    ) external loanAlive {
        require(collats.length == collateralChange.length, "LMCV/Need amount for each collateral");
        require(approval(user, msg.sender), "LMCV/Owner must consent");
        dPrimeChange = dPrimeChange * RAY;

        //Withdraw their dPrime first then unlock collateral
        console.log("Withdrawn dPrime: %s", withdrawnDPrime[user]);
        console.log("New debtDPrime:   %s", (debtDPrime[user]-dPrimeChange));
        require(withdrawnDPrime[user] <= (debtDPrime[user]-dPrimeChange), "LMCV/Cannot have more withdrawn dPrime than debt");
        debtDPrime[user] -= dPrimeChange;
        ProtocolDebt -= dPrimeChange;

        for(uint256 i = 0; i < collats.length; i++){
            CollateralType storage collateralType = CollateralTypes[collats[i]];

            uint256 newLockedCollat = lockedCollateral[user][collats[i]];
            uint256 newUnlockedCollat = unlockedCollateral[user][collats[i]];

            //Change from locked collateral to unlocked collateral
            newLockedCollat -= collateralChange[i];
            newUnlockedCollat += collateralChange[i];

            //New locked collateral set then immediately check solvency
            lockedCollateral[user][collats[i]] = newLockedCollat;
            require(_getMaxDPrime(user) >= debtDPrime[user], "LMCV/More dPrime left than allowed");

            //Give user their unlocked collateral

            collateralType.totalDebt -= collateralChange[i];
            unlockedCollateral[user][collats[i]] = newUnlockedCollat;
        }

        //Remove dust from locked list
        bytes32[] storage lockedCollats = lockedCollateralList[user];
        uint256 length = lockedCollats.length;
        for(uint j = length; j > 0; j--){
            uint256 iter = j-1;
            CollateralType memory collateralType = CollateralTypes[lockedCollats[iter]];

            // console.log("i: %s", j);
            // console.log("Collat: %s", bytes32ToString(lockedCollats[iter]));

            if(lockedCollateral[user][lockedCollats[iter]] < collateralType.debtFloor){
                uint256 amount = lockedCollateral[user][lockedCollats[iter]];
                lockedCollateral[user][lockedCollats[iter]] = 0;
                unlockedCollateral[user][lockedCollats[iter]] += amount;
                deleteElement(lockedCollats, iter);
            }
        }
        
        emit LoanRepayment(debtDPrime[user], user, collats, collateralChange);
    }

    //Coin prices increase and they want to take out more without changing collateral
    //Or coin prices decrease and they want to repay dPrime
    function addLoanedDPrime(address user, uint256 rad) external { // [rad]
        require(approval(user, msg.sender), "LMCV/Owner must consent");
        require(_getMaxDPrime(user) > (debtDPrime[user]+ rad), "LMCV/Minting more dPrime than allowed");
        ProtocolDebt += rad;
        require(ProtocolDebt < ProtocolDebtCeiling, "LMCV/Cannot extend past protocol debt ceiling");

        //Last thing that happens is actual ability to mint dPrime
        debtDPrime[user] += rad;
        emit AddLoanedDPrime(user, rad);
    }

    //Will liquidate half of entire portfolio to regain healthy portfolio status
    //until the portfolio is too small to be split, in which case it liquidates
    //the entire portfolio - large accounts could liquidate many times
    function liquidate(
        address liquidated, 
        address liquidator, 
        uint256 percentage // [ray]
    ) external liqAlive { 
        uint256 totalValue = _getPortfolioValue(liquidated); // [rad]
        require(!_isHealthy(liquidated), "LMCV/Vault is healthy");

        //Check if beneath debtFloor or debt/loan > 81%
        uint256 percentAllowed = partialLiqMax; // [ray]
        uint256 valueRatio = debtDPrime[liquidated] * RAY / totalValue; // [ray]

        // console.log("Insolvency percentage %s", valueRatio);
        // console.log("Value x Partial %s", _rmul(debtDPrime[liquidated], partialLiqMax));
        // console.log("Insolv > wholeCDP %s", valueRatio > wholeCDPLiqMult);
        // console.log("First condition:  %s", _rmul(debtDPrime[liquidated], partialLiqMax) < liquidiationFloor );
        // console.log("Second condition:  %s", valueRatio > wholeCDPLiqMult);
        if( _rmul(debtDPrime[liquidated], partialLiqMax) < liquidiationFloor 
            || valueRatio > wholeCDPLiqMult
        ){
            percentAllowed = RAY; //100% of dPrime value from collateral
        }
        if(percentage > percentAllowed){
            percentage = percentAllowed;
        }

        //take dPrime from liquidator
        uint256 repaymentValue = _rmul(debtDPrime[liquidated], percentage); // [rad]
        console.log("Repayment val: %s", repaymentValue);
        liqDPrime[liquidator] -= repaymentValue;

        // Move collateral to liquidator's address
        for(uint256 i = 0; i < lockedCollateralList[liquidated].length; i++){
            bytes32 collateral = lockedCollateralList[liquidated][i];
            uint256 lockedAmount = lockedCollateral[liquidated][collateral]; // [wad]






            //Something screwy right below I think -> Amount too low I would guess
            uint256 liquidateableAmount = _rmul(lockedAmount, valueRatio); // wad,ray -> wad
            uint256 liquidationAmount =  _rmul(liquidateableAmount,(percentage + (_rmul(percentage, CollateralTypes[collateral].liqBonusMult)))); // wad,ray -> wad

            console.log("\n Collateral: %s", bytes32ToString(collateral));
            console.log("liquidationAmount   %s", liquidationAmount);
            lockedAmount -= liquidationAmount;
            lockedCollateral[liquidated][collateral] = lockedAmount;
            unlockedCollateral[liquidator][collateral] += liquidationAmount;
        }

        //take fee
        //TODO: Remove protocol fee when insolvency is high (governance var)
        uint256 protocolLiqFee = _rmul(repaymentValue, protocolLiqFeeMult);
        repaymentValue -= protocolLiqFee;
        debtDPrime[feeTaker] += protocolLiqFee;

        //remove debt from protocol
        ProtocolDebt -= repaymentValue;

        //repay liquidated's debt
        debtDPrime[liquidated] -= repaymentValue;

        //TODO: What makes the most sense? Amount of dPrime withdrawn is subtracted by the liquidated amount?
        // Or does it make most sense to 
        emit Liquidation(liquidated, liquidator, percentage);
    }

    function fork() external {
        //TODO: Write fork function
    }

    //Move these functions to liquidation contract
    function isHealthy(address user) external view returns (bool health){
        return _isHealthy(user);
    }

    function _isHealthy(address user) internal view returns (bool health) { 
        if(_rmul(_getPortfolioValue(user), liquidationMult) > debtDPrime[user]){
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
            CollateralType storage collateralType = CollateralTypes[lockedList[i]];
            if(lockedCollateral[user][lockedList[i]] > collateralType.debtFloor){
                uint256 value = lockedCollateral[user][lockedList[i]] * collateralType.spotPrice; // wad*ray -> rad
                maxDPrime += _rmul(value, collateralType.debtMult); // rmul(rad, ray) -> rad
            }
        }
        return maxDPrime;
    }

    function getPortfolioValue(address user) external view returns (uint256 maxDPrime) {
        return _getPortfolioValue(user);
    }

    function _getPortfolioValue(address user) internal view returns (uint256 value){
        bytes32[] storage lockedList = lockedCollateralList[user];
        for(uint256 i = 0; i < lockedList.length; i++){
            CollateralType storage collateralType = CollateralTypes[lockedList[i]];
            if(lockedCollateral[user][lockedList[i]] > collateralType.debtFloor){
                uint256 collatVal = lockedCollateral[user][lockedList[i]] * collateralType.spotPrice; // wad*ray -> rad
                value += collatVal;
            }
        }
        return value;
    }

    function getUnlockedCollateralValue(address user, bytes32[] memory collateralList) external view returns (uint256 unlockedValue) {
        for(uint256 i = 0; i < collateralList.length; i++){
            CollateralType storage collateralType = CollateralTypes[collateralList[i]];
            if(unlockedCollateral[user][collateralList[i]] > collateralType.debtFloor){
                unlockedValue += (unlockedCollateral[user][collateralList[i]] * collateralType.spotPrice); // wad*ray -> rad
            }
        }
        return unlockedValue;
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

    function bytes32ToString(bytes32 _bytes32) public pure returns (string memory) {
        uint8 i = 0;
        while(i < 32 && _bytes32[i] != 0) {
            i++;
        }
        bytes memory bytesArray = new bytes(i);
        for (i = 0; i < 32 && _bytes32[i] != 0; i++) {
            bytesArray[i] = _bytes32[i];
        }
        return string(bytesArray);
    }
}
