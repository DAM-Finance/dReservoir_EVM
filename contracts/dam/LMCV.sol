// SPDX-License-Identifier: AGPL-3.0-or-later

/// LMCV.sol -- dPrime CDP database

// - `wad`: fixed point decimal with 18 decimals (for basic quantities, e.g. balances)
// - `ray`: fixed point decimal with 27 decimals (for precise quantites, e.g. ratios)
// - `rad`: fixed point decimal with 45 decimals (result of integer multiplication with a `wad` and a `ray`)

pragma solidity 0.8.7;

import "hardhat/console.sol";

contract LMCV {
    mapping (address => uint256) public admins;
    mapping (address => mapping (address => uint256))    public proxyApprovals;

    struct CollateralType {
        uint256 spotPrice;          // [ray] - ratio of dPrime per unit of collateral
        uint256 totalDebt;          // [wad] - normalized dPrime
        uint256 rate;               // [ray] - accumulated rates
        uint256 debtCeiling;        // [wad] - Protocol Level
        uint256 debtFloor;          // [wad] - Account level
        uint256 debtMult;           // [ray] - ie. max 70% loaned out as dPrime
        uint256 liqBonusMult;       // [ray] - ie. 5% for bluechip, 15% for junk
    }

    struct Chest{ //Nod to MakerDao
        uint256 lockedCollateral;   // Locked Collateral  [wad]
        uint256 normalDebt;   // Normalised Debt    [wad]
    }

    bytes32[] public CollateralList;
    mapping (bytes32 => CollateralType)                 public CollateralTypes;

    //CDP
    mapping (address => bytes32[])                      public lockedCollateralList;
    mapping (address => mapping (bytes32 => uint256))   public lockedCollateral;    // [wad]
    mapping (address => mapping (bytes32 => uint256))   public unlockedCollateral;  // [wad]

    mapping (address => uint256)                        public normalDebt;          // [wad] - normalized
    mapping (address => uint256)                        public dPrime;              // [rad] - withdrawable
    mapping (address => uint256)                        public dPrimeGiven;         // [rad] - Accounting of loaned/repaid dPrime
    
    //Admin
    uint256 public loanLive;
    uint256 public ProtocolDebt;        // [rad]
    uint256 public ProtocolDebtCeiling; // [rad]
    uint256 public mintFee;             // [ray]
    address public treasury;

    //Liquidation
    mapping (address => uint256) public liquidationDebt;    // [rad]
    uint256 public totalLiquidationDebt;                    // [rad]
    uint256 public liquidationMult;                         // [ray] ie. user at 80% dPrime/collateral ratio -> liquidate


    // --- Events ---
    event EditAcceptedCollateralType(bytes32 indexed collateralName, uint256 _debtCeiling, uint256 _debtFloor, uint256 _debtMult, uint256 _liqBonusMult, uint256 _rate);
    event Liquidation(address indexed liquidated, address indexed liquidator, uint256 normalDebtChange, bytes32[] collats, uint256[] collateralChange);
    event LoanRepayment(uint256 indexed dPrimeChange, address indexed user, bytes32[] collats, uint256[] amounts);
    event CreateLiquidationDebt(address indexed debtReceiver, address indexed dPrimeReceiver, uint256 rad);
    event Loan(uint256 indexed dPrimeChange, address indexed user, bytes32[] collats, uint256[] amounts);
    event MoveCollateral(bytes32 indexed collat, address indexed src, address indexed dst, uint256 wad);
    event PushCollateral(bytes32 indexed collat, address indexed src, uint256 wad);
    event PullCollateral(bytes32 indexed collat, address indexed src, uint256 wad);
    event MovePortfolio(address indexed src, address indexed dst);
    event PushLiquidationDPrime(address indexed src, uint256 rad);
    event PullLiquidationDPrime(address indexed src, uint256 rad);
    event SpotUpdate(bytes32 indexed collateral, uint256 spot);
    event RepayLiquidationDebt(address indexed u, uint256 rad);
    event UpdateRate(bytes32 indexed collateral, int256 rate);
    event AddLoanedDPrime(address indexed user, uint256 rad);
    event EnterDPrime(address indexed src, uint256 rad);
    event ExitDPrime(address indexed src, uint256 rad);
    

    modifier auth() {
        require(admins[msg.sender] == 1, "LMCV/Not Authorized");
        _;
    }

    modifier loanAlive() {
        require(loanLive == 1, "LMCV/Loan paused");
        _;
    }

    constructor() {
        loanLive = 1;
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
    // Can only be used sensibly with the following combination of units:
    // - `rmul(wad, ray) -> wad`
    // - `rmul(ray, ray) -> ray`
    // - `rmul(rad, ray) -> rad`
    function _rmul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = x * y;
        require(y == 0 || z / y == x);
        z = z / RAY;
    }

    function rdivup(uint256 x, uint256 y) internal pure returns (uint256 z) {
        // always rounds up
        z = ((x * RAY) + (y-1)) / y;
    }

    function _add(uint256 x, int256 y) internal pure returns (uint256 z) {
        unchecked {
            z = x + uint256(y);
        }
        require(y >= 0 || z <= x);
        require(y <= 0 || z >= x);
    }

    function _int256(uint256 x) internal pure returns (int256 y) {
        require((y = int256(x)) >= 0);
    }

    // --- Protocol Admin ---
    function setLoanAlive(uint256 flag) external auth {
        loanLive = flag;
    }

    function setProtocolDebtCeiling(uint256 rad) external auth {
        ProtocolDebtCeiling = rad;
    }

    function setMintFee(uint256 ray) external auth {
        mintFee = ray;
    }

    function setFeeTaker(address _treasury) external auth {
        require(treasury != address(0x0), "LMCV/Can't be zero address");
        treasury = _treasury;
    }
    
    // --- Liquidation Admin ---
    function setLiquidationMult(uint256 ray) external auth {
        liquidationMult = ray;
    }

    // --- Collateral Admin ---
    function collatDebtCeiling(bytes32 collateral, uint256 wad) external auth {
        CollateralTypes[collateral].debtCeiling = wad;
    }

    function collatDebtFloor(bytes32 collateral, uint256 wad) external auth {
        CollateralTypes[collateral].debtFloor = wad;
    }

    function collatRate(bytes32 collateral, uint256 ray) external auth {
        require(ray >= RAY, "LMCV/Collateral rate must be greater than or equal to 1");
        CollateralTypes[collateral].rate = ray;
    }

    function collatDebtMult(bytes32 collateral, uint256 ray) external auth {
        require(CollateralTypes[collateral].debtMult <= liquidationMult, "LMCV/Debt multiplier must be lower than liquidation multiplier");
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
        uint256 _liqBonusMult,      // [ray] - ie. 5% for bluechip, 15% for junk
        uint256 _rate               // [ray] - accumulated interest rate
    ) external auth {
        CollateralType memory collateralType = CollateralTypes[collateralName];
        collateralType.debtCeiling = _debtCeiling;
        collateralType.debtFloor = _debtFloor;
        collateralType.debtMult = _debtMult;
        collateralType.liqBonusMult = _liqBonusMult;
        require(_rate >= RAY, "LMCV/Collater rate must be greater than or equal to 1");
        collateralType.rate = _rate;


        CollateralTypes[collateralName] = collateralType;
        emit EditAcceptedCollateralType(collateralName, _debtCeiling, _debtFloor, _debtMult, _liqBonusMult, _rate);
    }

    // --- Fungibility ---
    function pushCollateral(bytes32 collat, address user, uint256 wad) external auth {
        unlockedCollateral[user][collat] += wad;
        emit PushCollateral(collat, user, wad);
    }

    function pullCollateral(bytes32 collat, address user, uint256 wad) external auth {
        unlockedCollateral[user][collat] -= wad;
        emit PullCollateral(collat, user, wad);
    }

    function exitDPrime(address src, uint256 rad) external auth {
        dPrime[src] -= rad;
        emit ExitDPrime(src, rad);
    }

    function enterDPrime(address src, uint256 rad) external auth {
        dPrime[src] += rad;
        emit EnterDPrime(src, rad);
    }

    function moveCollateral(bytes32 collat, address src, address dst, uint256 wad) external {
        require(approval(src, msg.sender), "LMCV/not allowed");
        unlockedCollateral[src][collat] -= wad;
        unlockedCollateral[dst][collat] += wad;
        emit MoveCollateral(collat, src, dst, wad);
    }

    //All collaterals linked together to be more portfolio centric
    //eg: measure of whether a vault is safe or not is done based on
    //the vault as a whole being overcollateralized properly
    function loan(
        bytes32[] memory collats,        
        uint256[] memory collateralChange,  // [wad]
        uint256 normalDebtChange,           // [wad] normalized
        address user
    ) external loanAlive {
        require(collats.length == collateralChange.length, "LMCV/Need amount for each collateral");
        require(approval(user, msg.sender), "LMCV/Owner must consent");

        //TODO: On a per collateral basis like repay

        //Locks up all collateral
        for(uint256 i = 0; i < collats.length; i++){
            CollateralType memory collateralType = CollateralTypes[collats[i]];
            require(collateralType.debtCeiling > 0 && collateralType.debtMult > 0 && collateralType.rate >= 1, "LMCV/collateral type not initialized");

            //if collateral is newly introduced to cdp
            //add it to the locked collateral list
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

        uint256 weightedRate = getWeightedRateByCollateral(collats, collateralChange);
        uint256 dPrimeOut = normalDebtChange * weightedRate;
        // console.log("Inside Weighted Rate: %s", weightedRate);

        //Need to check to make sure its under liquidation amount
        require(_rmul(getPortfolioValue(user), liquidationMult) > (normalDebtChange + normalDebt[user]) * weightedRate, "LMCV/Minting more dPrime than allowed");
        require(getMaxDPrimeDebt(user) >= (normalDebtChange + normalDebt[user]) * weightedRate, "LMCV/Minting more dPrime than allowed");
        

        ProtocolDebt += dPrimeOut;
        require(ProtocolDebt < ProtocolDebtCeiling, "LMCV/Cannot extend past protocol debt ceiling");

        //Last thing that happens is actual ability to mint dPrime
        //TODO: IMPLEMENT MINTING FEE HERE
        normalDebt[user] += normalDebtChange;
        
        console.log("dPrime increase %s", normalDebtChange * weightedRate);
        dPrime[user] += normalDebtChange * weightedRate; //Test
        console.log("dPrime left    %s \n", dPrime[user]);
        emit Loan(normalDebt[user], user, collats, collateralChange);
    }

    //Repay any percentage of the loan and unlock collateral
    //Or repay none if overcollateralized properly
    function repay(
        bytes32[] memory collats, 
        uint256[] memory collateralChange, // [wad]
        uint256 normalDebtChange, // [wad]
        address user
    ) external loanAlive {
        require(collats.length == collateralChange.length, "LMCV/Need amount for each collateral");
        require(approval(user, msg.sender), "LMCV/Owner must consent");

        for(uint256 i = 0; i < collats.length; i++){
            CollateralType storage collateralType = CollateralTypes[collats[i]];

            uint256 normalDebtAmt = collateralChange[i]*collateralType.spotPrice / RAY * collateralType.debtMult / collateralType.rate;
            require(normalDebtChange >= normalDebtAmt, "LMCV/Not enough collateral to remove debt"); 
            normalDebtChange -= normalDebtAmt;
            console.log("normalDebt     %s", normalDebt[user]*RAY);
            console.log("normalDebtAmt  %s", normalDebtAmt*RAY);
            uint256 dPrimeNeeded = normalDebtAmt * collateralType.rate;
            console.log("dPrime left    %s", dPrime[user]);
            console.log("DPRIME NEEDED: %s", dPrimeNeeded);
            dPrime[user] -= dPrimeNeeded;
            normalDebt[user] -= normalDebtAmt;
            ProtocolDebt -= dPrimeNeeded;

            uint256 newLockedCollat = lockedCollateral[user][collats[i]];
            uint256 newUnlockedCollat = unlockedCollateral[user][collats[i]];

            //Change from locked collateral to unlocked collateral
            newLockedCollat -= collateralChange[i];
            newUnlockedCollat += collateralChange[i];

            require(newLockedCollat > collateralType.debtFloor || newLockedCollat == 0, "LMCV/Collateral must be higher than dust level");

            //New locked collateral set then immediately check solvency
            //Has to call getWeightedRate again because weighted rate has changed since above
            lockedCollateral[user][collats[i]] = newLockedCollat;
            console.log("maxDPrime debt %s", getMaxDPrimeDebt(user));
            console.log("owed           %s \n", normalDebt[user] * getWeightedRateByUser(user));
            
            require(getMaxDPrimeDebt(user) >= normalDebt[user] * getWeightedRateByUser(user), "LMCV/More dPrime left than allowed");

            //Give user their unlocked collateral
            collateralType.totalDebt -= collateralChange[i];
            unlockedCollateral[user][collats[i]] = newUnlockedCollat;
        }

        //Remove collateral from locked list if fully repaid
        bytes32[] storage lockedCollats = lockedCollateralList[user];
        uint256 length = lockedCollats.length;
        for(uint j = length; j > 0; j--){
            uint256 iter = j-1;

            // console.log("i: %s", j);
            // console.log("Collat: %s", bytes32ToString(lockedCollats[iter]));
            if(lockedCollateral[user][lockedCollats[iter]] == 0){
                deleteElement(lockedCollats, iter);
            }
        }

        uint256 weightedRate = getWeightedRateByUser(user);
        require(getMaxDPrimeDebt(user) >= (normalDebt[user] - normalDebtChange) * weightedRate, "LMCV/Minting more dPrime than allowed");

        dPrime[user] -= normalDebtChange * weightedRate;
        normalDebt[user] -= normalDebtChange;
        ProtocolDebt -= normalDebtChange * weightedRate;

        // console.log("normDebt leftover  %s", normalDebtChange*RAY);
        // console.log("maxDPrime debt %s", getMaxDPrimeDebt(user));
        // console.log("owed           %s", normalDebt[user] * getWeightedRate(user));
        // console.log("dPrime left    %s \n", dPrime[user]);

        emit LoanRepayment(normalDebt[user], user, collats, collateralChange);
    }

    //Coin prices increase and they want to take out more without changing collateral
    //Or coin prices decrease and they want to repay dPrime
    function addLoanedDPrime(address user, uint256 normalDebtChange) loanAlive external { // [wad]
        require(approval(user, msg.sender), "LMCV/Owner must consent");

        uint256 weightedRate = getWeightedRate(user);
        require(_rmul(getPortfolioValue(user), liquidationMult) > (normalDebtChange + normalDebt[user]) * weightedRate, "LMCV/Minting more dPrime than allowed");
        require(getMaxDPrimeDebt(user) > (normalDebt[user]+ normalDebtChange) * weightedRate, "LMCV/Minting more dPrime than allowed");
        
        ProtocolDebt += normalDebtChange * weightedRate;
        require(ProtocolDebt < ProtocolDebtCeiling, "LMCV/Cannot extend past protocol debt ceiling");

        //Last thing that happens is actual ability to mint dPrime
        normalDebt[user] += normalDebtChange;
        dPrime[user] += normalDebtChange * weightedRate; //Test
        emit AddLoanedDPrime(user, normalDebtChange);
    }

    //Basic liquidation to allow for liquidation contract management
    function liquidate(
        bytes32[] memory collats,
        uint256[] memory collateralChange,  // [wad]
        uint256 normalDebtChange,           // [wad]
        address liquidated, 
        address liquidator,
        address liquidationContract         // assigned the liquidation debt
    ) external auth {
        require(collats.length == collateralChange.length, "LMCV/Need amount for each collateral");
        //Use weighted rate of collateral actually removed 
        uint256 dPrimeDebt = normalDebtChange * getWeightedRateByCollateral(collats, collateralChange);

        //Add debt to the protocol's liquidation contract
        totalLiquidationDebt += dPrimeDebt;
        liquidationDebt[liquidationContract] += dPrimeDebt;

        // Move collateral from liquidated address to liquidator's address
        for(uint256 i = 0; i < collats.length; i++){
            bytes32 collateral = collats[i];
            // console.log("\n Collateral: %s", bytes32ToString(collateral));
            // console.log("liquidationAmount   %s", liquidationAmount);
            CollateralTypes[collateral].totalDebt -= collateralChange[i];
            lockedCollateral[liquidated][collateral] -= collateralChange[i];
            unlockedCollateral[liquidator][collateral] += collateralChange[i];
        }

        normalDebt[liquidated] -= normalDebtChange;
        ProtocolDebt -= dPrimeDebt;
        emit Liquidation(liquidated, liquidator, normalDebtChange, collats, collateralChange);
    }

    // --- Settlement ---
    // Only liquidation contract can successfully call heal
    function repayLiquidationDebt(uint256 rad) external {
        address u = msg.sender;
        liquidationDebt[u] -= rad;
        dPrime[u] -= rad;
        totalLiquidationDebt -= rad;
        ProtocolDebt -= rad;

        emit RepayLiquidationDebt(msg.sender, rad);
    }

    function createLiquidationDebt(address debtReceiver, address dPrimeReceiver, uint256 rad) external auth {
        liquidationDebt[debtReceiver] += rad;
        dPrime[dPrimeReceiver] += rad;
        totalLiquidationDebt += rad;
        ProtocolDebt += rad;

        emit CreateLiquidationDebt(debtReceiver, dPrimeReceiver, rad);
    }

    // --- Rates ---
    function updateRate(bytes32 collateral, int256 rateIncrease) external auth loanAlive {
        CollateralType storage collateralType = CollateralTypes[collateral];
        collateralType.rate = _add(collateralType.rate, rateIncrease);
        int256 rad          = _int256(collateralType.totalDebt) * rateIncrease;
        dPrime[treasury]    = _add(dPrime[treasury], rad);
        ProtocolDebt        = _add(ProtocolDebt,   rad);

        emit UpdateRate(collateral, rateIncrease);
    }

    // --- Helpers ---
    function isHealthy(address user) public view returns (bool healthy){
        if(_rmul(getPortfolioValue(user), liquidationMult) > normalDebt[user] * getWeightedRate(user)){
            return true;
        }
        return false;
    }

    function getMaxDPrimeDebt(address user) public view returns (uint256 maxDPrime) { // [rad]
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

    function getWeightedRateByUser(address user) public view returns (uint256 weightedRate) { // [ray]
        bytes32[] storage lockedList = lockedCollateralList[user];
        uint256 totalValue = 0;
        uint256 weightedValue = 0;
        for(uint256 i = 0; i < lockedList.length; i++){
            CollateralType storage collateralType = CollateralTypes[lockedList[i]];
            if(lockedCollateral[user][lockedList[i]] > collateralType.debtFloor){
                uint256 value = lockedCollateral[user][lockedList[i]] * collateralType.spotPrice; // wad*ray -> rad
                totalValue += value / RAY;
                weightedValue += _rmul(value, collateralType.rate); // rmul(rad, ray) -> rad
            }
        }
        return weightedValue > 0 && totalValue > 0 ? totalValue / weightedValue : RAY;
    }

    function getWeightedRateByCollateral(bytes32[] memory collateralList, uint256[] memory amounts) public view returns (uint256 weightedRate) { // [ray]
        uint256 totalValue = 0;
        uint256 weightedValue = 0;
        for(uint256 i = 0; i < collateralList.length; i++){
            CollateralType storage collateralType = CollateralTypes[collateralList[i]];
            uint256 value = amounts[i] * collateralType.spotPrice; // wad*ray -> rad
            totalValue += value;
            weightedValue += value / collateralType.rate; // rad / ray -> wad
        }
        return weightedValue > 0 && totalValue > 0 ? totalValue / weightedValue : RAY;
    }

    function getPortfolioValue(address user) internal view returns (uint256 value){
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

    //WARNING: Does not care about order
    function deleteElement(bytes32[] storage array, uint256 i) internal {
        require(i < array.length, "Array out of bounds");
        array[i] = array[array.length-1];
        array.pop();
    }

    // function bytes32ToString(bytes32 _bytes32) public pure returns (string memory) {
    //     uint8 i = 0;
    //     while(i < 32 && _bytes32[i] != 0) {
    //         i++;
    //     }
    //     bytes memory bytesArray = new bytes(i);
    //     for (i = 0; i < 32 && _bytes32[i] != 0; i++) {
    //         bytesArray[i] = _bytes32[i];
    //     }
    //     return string(bytesArray);
    // }
}
