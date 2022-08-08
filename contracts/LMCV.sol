// SPDX-License-Identifier: AGPL-3.0-or-later

// - `wad`: fixed point decimal with 18 decimals (for basic quantities, e.g. balances)
// - `ray`: fixed point decimal with 27 decimals (for precise quantites, e.g. ratios)
// - `rad`: fixed point decimal with 45 decimals (result of integer multiplication with a `wad` and a `ray`)

pragma solidity 0.8.7;

/*

    LMCV.sol -- dPrime CDP database. Handles accounting for the protocol.
    Keeps track of collateral, debt and dPRIME balances. This should not
    require regular updates. All other anxillary contracts are permissioned
    to call functinos on this contract.

*/
contract LMCV {

    //
    // Authorisation.
    //

    mapping (address => uint256) public admins;
    mapping (address => bool)    public PSMAddresses;
    mapping (address => mapping (address => uint256))    public proxyApprovals;

    //
    // Collateral level data.
    //

    struct Collateral {
        uint256 spotPrice;              // [ray] - dPrime (I.e. USD) price of collateral.
        uint256 lockedAmount;           // [wad] - amount of collateral locked.
        uint256 lockedAmountLimit;      // [wad] - Protocol Level limit for amount of locked collateral.
        uint256 dustLevel;              // [wad] - Minimum amount of collateral allowed per vault.
        uint256 creditRatio;            // [ray] - ie. max 70% loaned out as dPrime.
        uint256 liqBonusMult;           // [ray] - ie. 5% for bluechip, 15% for junk
        bool    leveraged;
    }
    bytes32[] public CollateralList;
    mapping (bytes32 => Collateral)                     public CollateralData;

    //
    // Vault level data.
    //

    mapping (address => bytes32[])                      public lockedCollateralList;    // List of collateral IDs locked by each vault.
    mapping (address => uint256)                        public normalizedDebt;          // [wad] - Debt amount for each vault in t=0 terms.
    mapping (address => mapping (bytes32 => uint256))   public lockedCollateral;        // [wad] - counts towards portfolio valuation.
    mapping (address => mapping (bytes32 => uint256))   public unlockedCollateral;      // [wad] - does not count towards portfolio valuation.
    mapping (address => uint256)                        public dPrime;                  // [rad] - user's dPRIME balance.

    //
    // Protocol level data.
    //

    uint256 public totalNormalizedDebt; // [wad] - Total protocol level debt in t=0 terms.
    uint256 public totalPSMDebt;        // [wad]
    uint256 public totalDPrime;         // [rad] - Total amount of dPRIME issued.
    uint256 public ProtocolDebtCeiling; // [rad] - Maximum amount of dPRIME issuable.
    uint256 public MintFee;             // [ray] - Minting fee as a percentage of a newly issued dPRIME amount.
    uint256 public AccumulatedRate;     // [ray] - Rename this as this is a cumulative value, rather than the per second compounding rate.

    //
    // Admin.
    //

    uint256 public loanLive;
    address public Treasury;

    //
    // Liquidation.
    //

    mapping (address => uint256)                        public protocolDeficit;         // [rad]
    uint256                                             public totalProtocoldeficit;    // [rad]

    //
    // Events
    //

    event EditAcceptedCollateralType(bytes32 indexed collateralName, uint256 _debtCeiling, uint256 _debtFloor, uint256 _creditRatio, uint256 _liqBonusMult, bool _leveraged);
    event Liquidation(address indexed liquidated, address indexed liquidator, uint256 normalDebtChange, bytes32[] collats, uint256[] collateralChange);
    event LoanRepayment(uint256 indexed dPrimeChange, address indexed user, bytes32[] collats, uint256[] amounts);
    event Loan(uint256 indexed dPrimeChange, address indexed user, bytes32[] collats, uint256[] amounts);
    event MoveCollateral(bytes32 indexed collat, address indexed src, address indexed dst, uint256 wad);
    event Inflate(address indexed debtReceiver, address indexed dPrimeReceiver, uint256 rad);
    event PushCollateral(bytes32 indexed collat, address indexed src, uint256 wad);
    event PullCollateral(bytes32 indexed collat, address indexed src, uint256 wad);
    event MoveDPrime(address indexed src, address indexed dst, uint256 frad);
    event LockedAmountLimit(bytes32 indexed collateral, uint256 wad);
    event LiquidationBonus(bytes32 indexed collateral, uint256 ray);
    event MovePortfolio(address indexed src, address indexed dst);
    event PushLiquidationDPrime(address indexed src, uint256 rad);
    event PullLiquidationDPrime(address indexed src, uint256 rad);
    event SpotUpdate(bytes32 indexed collateral, uint256 spot);
    event CreditRatio(bytes32 indexed collateral, uint256 ray);
    event AddLoanedDPrime(address indexed user, uint256 rad);
    event DustLevel(bytes32 indexed collateral, uint256 wad);
    event EnterDPrime(address indexed src, uint256 rad);
    event ExitDPrime(address indexed src, uint256 rad);
    event Deflate(address indexed u, uint256 rad);
    event UpdateRate(int256 rate);

    modifier auth() {
        require(admins[msg.sender] == 1, "LMCV/Not Authorized");
        _;
    }

    modifier loanAlive() {
        require(loanLive == 1, "LMCV/Loan paused");
        _;
    }

    constructor() {
        AccumulatedRate = RAY;
        loanLive = 1;
        admins[msg.sender] = 1;
        Treasury = msg.sender;
    }

    //
    // Authorisation.
    //

    function administrate(address admin, uint256 authorization) external auth {
        admins[admin] = authorization;
    }

    function approveMultiple(address[] memory users) external {
        for(uint256 i = 0; i < users.length; i++){
            approve(users[i]);
        }
    }
    function approve(address user) public {
        proxyApprovals[msg.sender][user] = 1;
    }

    function disapproveMultiple(address[] memory users) external {
        for(uint256 i = 0; i < users.length; i++){
            disapprove(users[i]);
        }
    }
    function disapprove(address user) public {
        proxyApprovals[msg.sender][user] = 0;
    }

    function approval(address bit, address user) internal view returns (bool) {
        return either(bit == user, proxyApprovals[bit][user] == 1);
    }

    //
    // Math.
    //

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

    //
    // Protocol Admin.
    //

    function setLoanAlive(uint256 flag) external auth {
        loanLive = flag;
    }

    function setProtocolDebtCeiling(uint256 rad) external auth {
        ProtocolDebtCeiling = rad;
    }

    function setMintFee(uint256 ray) external auth {
        MintFee = ray;
    }

    function setTreasury(address _treasury) external auth {
        require(_treasury != address(0x0), "LMCV/Can't be zero address");
        Treasury = _treasury;
    }

    function setPSMAddress(address psm, bool status) external auth {
        require(psm != address(0x0), "LMCV/Can't be zero address");
        PSMAddresses[psm] = status;
    }

    //
    // Collateral admin.
    //

    function editLockedAmountLimit(bytes32 collateral, uint256 wad) external auth {
        CollateralData[collateral].lockedAmountLimit = wad;
        emit LockedAmountLimit(collateral, wad);
    }

    function editDustLevel(bytes32 collateral, uint256 wad) external auth {
        CollateralData[collateral].dustLevel = wad;
        emit DustLevel(collateral, wad);
    }

    function editCreditRatio(bytes32 collateral, uint256 ray) external auth {
        CollateralData[collateral].creditRatio = ray;
        emit CreditRatio(collateral, ray);
    }

    function editLiquidationBonus(bytes32 collateral, uint256 ray) external auth {
        CollateralData[collateral].liqBonusMult = ray;
        emit LiquidationBonus(collateral, ray);
    }

    function editLeverageStatus(bytes32 collateral, bool _leveraged) external auth {
        CollateralData[collateral].leveraged = _leveraged;
    }

    function updateSpotPrice(bytes32 collateral, uint256 ray) external auth {
        CollateralData[collateral].spotPrice = ray;
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
        uint256 _lockedAmountLimit,     // [wad] - Protocol Level
        uint256 _dustLevel,             // [wad] - Account level
        uint256 _creditRatio,           // [ray] - ie. max 70% loaned out as dPrime
        uint256 _liqBonusMult,           // [ray] - ie. 5% for bluechip, 15% for junk
        bool    _leveraged
    ) external auth {
        Collateral memory collateralData    = CollateralData[collateralName];
        collateralData.lockedAmountLimit    = _lockedAmountLimit;
        collateralData.dustLevel            = _dustLevel;
        collateralData.creditRatio          = _creditRatio;
        collateralData.liqBonusMult         = _liqBonusMult;
        collateralData.leveraged = _leveraged;

        CollateralData[collateralName] = collateralData;
        emit EditAcceptedCollateralType(collateralName, _lockedAmountLimit, _dustLevel, _creditRatio, _liqBonusMult,  _leveraged);
    }

    //
    // Unlocked collateral transactions.
    //

    function pushCollateral(bytes32 collat, address user, uint256 wad) external auth {
        unlockedCollateral[user][collat] += wad;
        emit PushCollateral(collat, user, wad);
    }

    function pullCollateral(bytes32 collat, address user, uint256 wad) external auth {
        unlockedCollateral[user][collat] -= wad;
        emit PullCollateral(collat, user, wad);
    }

    function moveCollateral(bytes32 collat, address src, address dst, uint256 wad) external {
        require(approval(src, msg.sender), "LMCV/collateral move not allowed");
        unlockedCollateral[src][collat] -= wad;
        unlockedCollateral[dst][collat] += wad;
        emit MoveCollateral(collat, src, dst, wad);
    }

    //
    // dPRIME transactions.
    //

    function moveDPrime(address src, address dst, uint256 rad) external {
        require(approval(src, msg.sender), "LMCV/dPrime move not allowed");
        dPrime[src] -= rad;
        dPrime[dst] += rad;
        emit MoveDPrime(src, dst, rad);
    }

    //
    // Borrowing and repayment.
    //

    /*
     * Creating a loan is a three stage process:
     *
     * 1. Update collateral amounts for each collateral type. This is essentially an atomic swap of unlocked
     *    to locked collateral whilst ensuring per collateral limits are not exceeded.
     * 2. Update normalized debt value and check credit limits.
     * 3. Update the dPRIME ledger and record any minting fees.
     *
     * It can be the case that this function is called with either zero debt change or no collateral change
     * information. The former case allows users to lock more collateral and keep their debt constant. The
     * latter case allows users to withdraw more dPRIME whilst keeping collateral amounts constant. If this
     * function is called with a `normalizedDebtChange` vlaue of ZERO then technically no "loaning" is
     * happening. Regardless, we think the semantics still make sense.
     */
    function loan(
        bytes32[] memory collateralList,        // List of collateral identifiers.
        uint256[] memory collateralChange,      // List of collateral change amounts.   [wad]
        uint256 normalizedDebtChange,           // Debt change in t=0 terms.            [wad]
        address user                            // Address of the user's vault.
    ) external loanAlive {
        // The ordering of `collats` and `collateralChange` matters, so care must be taken when calling this function.
        require(collateralList.length == collateralChange.length, "LMCV/Missing collateral type or collateral amount");
        require(approval(user, msg.sender), "LMCV/Owner must consent");

        // 1. Update collateral amounts.
        for (uint256 i = 0; i < collateralList.length; i++) {
            Collateral memory collateralData = CollateralData[collateralList[i]];
            require(collateralData.lockedAmountLimit > 0 && collateralData.creditRatio > 0, "LMCV/Collateral data not initialized");

            // The user's vault does not contain this type of collateral yet. So register it.
            if (lockedCollateral[user][collateralList[i]] == 0) {
                lockedCollateralList[user].push(collateralList[i]);
            }

            // Debit unlocked collateral amount and credit locked collateral amount.
            uint256 newLockedCollateralAmount   = lockedCollateral[user][collateralList[i]]     += collateralChange[i];
            uint256 newUnlockedCollateralAmount = unlockedCollateral[user][collateralList[i]]   -= collateralChange[i];

            // Disallow collateral amounts less than the specified dust amount.
            require(newLockedCollateralAmount > collateralData.dustLevel, "LMCV/Locked collateral amount must be higher than dust level");

            // COMMENT: We could do a multiplication here with spot price and use something like `lockedValueLimit` to make this more clear?
            // I.e. we would be using dollar values of locked collateral instead of amounts of locked collateral.
            collateralData.lockedAmount += collateralChange[i];
            require(collateralData.lockedAmountLimit > collateralData.lockedAmount, "LMCV/Maximum protocol collateral amount exceeded");

            CollateralData[collateralList[i]] = collateralData;
            // Set new collateral numbers.
            lockedCollateral[user][collateralList[i]]   = newLockedCollateralAmount;
            unlockedCollateral[user][collateralList[i]] = newUnlockedCollateralAmount;
        }

        // If the PSM calls this function then we set fees and interest rate to zero.
        uint256 rateMult   = AccumulatedRate;
        uint256 mintingFee = _rmul(normalizedDebtChange * rateMult, MintFee);
        if(PSMAddresses[user]){
            rateMult = RAY;
            mintingFee = 0;
            totalPSMDebt += normalizedDebtChange;
        }

        // 2. Update vault debt value, total debt value and then check credit limit not exceeded.
        normalizedDebt[user]    += normalizedDebtChange;
        totalNormalizedDebt     += normalizedDebtChange;
        require(isWithinCreditLimit(user, rateMult), "LMCV/Exceeded portfolio credit limit");

        // 3. Update the dPRIME ledger and handle minting fees.
        // NormalisedDebt is a present value seen from the perspective of "day 1" and therefore must
        // be multiplied by the total accrued interest to date, to obtain the current value. This
        // value is equal to the amount of dPRIME issued because vaults accrue interest over time.
        totalDPrime += normalizedDebtChange * rateMult;
        require(totalDPrime < ProtocolDebtCeiling, "LMCV/Cannot extend past protocol debt ceiling");

        dPrime[Treasury] += mintingFee;
        dPrime[user] += normalizedDebtChange * rateMult - mintingFee;
        emit Loan(normalizedDebt[user], user, collateralList, collateralChange);
    }

    // This function allows users to do a combination of things:
    //
    // 1. If there vault is sufficiently over-collateralised, they can unlock some amount of collateral.
    //    the result being that their credit limit will decrease whilst their dPRIME balance/used credit
    //    remains the same. I.e. the vault becomes riskier.
    // 2. Repay some amount of dPRIME whilst keeping the locked collateral balance constant. This has the
    //    opposite effect of (1). I.e. the vault becomes less risky as the used credit/dPRIME balance
    //    decreases.
    // 3. A combination of the above.
    function repay(
        bytes32[] memory collateralList,        // List of collateral identifiers.
        uint256[] memory collateralChange,      // List of collateral amount changes.   [wad]
        uint256 normalizedDebtChange,           // Debt change in t=0 terms.            [wad]
        address user                            // Address of the user's vault.
    ) external loanAlive {
        require(collateralList.length == collateralChange.length, "LMCV/Missing collateral type or collateral amount");
        require(approval(user, msg.sender), "LMCV/Owner must consent");

        // If the PSM calls this function then we set fees and interest rate to zero.
        uint256 rateMult = AccumulatedRate;
        if(PSMAddresses[user]){
            rateMult = RAY;
            totalPSMDebt        -= normalizedDebtChange;
        }

        // 1. Update debt balances.
        //@Roger first thing we should be doing is setting owed debts correct
        dPrime[user]            -= normalizedDebtChange * rateMult;
        totalDPrime             -= normalizedDebtChange * rateMult;
        normalizedDebt[user]    -= normalizedDebtChange;
        totalNormalizedDebt     -= normalizedDebtChange;

        // 2. Update collateral balances and check limits.
        for(uint256 i = 0; i < collateralList.length; i++){
            Collateral storage collateralData = CollateralData[collateralList[i]];

            // Debit locked collateral amount and credit unlocked collateral amount.
            uint256 newLockedCollateralAmount   = lockedCollateral[user][collateralList[i]]     -= collateralChange[i];
            uint256 newUnlockedCollateralAmount = unlockedCollateral[user][collateralList[i]]   += collateralChange[i];

            // Users must not leave "dusty" amounts of collateral but they can remove the whole lot if they want to.
            require(newLockedCollateralAmount > collateralData.dustLevel || newLockedCollateralAmount == 0, "LMCV/Locked collateral amount must be higher than dust level");

            // Update collateral amounts.
            lockedCollateral[user][collateralList[i]]   = newLockedCollateralAmount;
            //@Roger check right here (multiple times) for reentrancy attacks - the audit will tell us if that's overkill
            require(isWithinCreditLimit(user, rateMult), "LMCV/Exceeded portfolio credit limit");
            unlockedCollateral[user][collateralList[i]] = newUnlockedCollateralAmount;
            collateralData.lockedAmount                 -= collateralChange[i];
        }

        // Remove collateral from locked list if fully repaid.
        bytes32[] storage lockedCollats = lockedCollateralList[user];
        for(uint j = lockedCollats.length; j > 0; j--){
            uint256 iter = j-1;
            if(lockedCollateral[user][lockedCollats[iter]] == 0){
                deleteElement(lockedCollats, iter);
            }
        }

        emit LoanRepayment(normalizedDebt[user], user, collateralList, collateralChange);
    }

    //
    // Liquidation
    //

    /*
     * If the value of dPRIME issued by a user falls below the credit limit for their vault, then
     * their vault (or a portion of it) can be liquidated. This function provides the liquidation 
     * contract an interface to the LMCV.
     *
     * When a liquidation happens, the amount of collateral to be liquidated is determined by the
     * liquidation contract. The resulting amount of debt change and collateral change is passed
     * on to this function.
     *
     * The effect of this function is to reduce the normalized debt and the locked collateral for
     * the user in question and the protocol as a whole. It is expected that the user's collateral
     * will reduce my more than the normalized debt balance due to the liquidation discount. It 
     * might be the case that the user's vault is still eligible for liquidation if it's a large
     * vault and the amount to liquidate is significantly larger than the auction lot size.
     */
    function liquidate(
        bytes32[] memory collateralList,    // List of collateral identifiers.
        uint256[] memory collateralChange,  // List of collateral amount changes.   [wad]
        uint256 normalizedDebtChange,       // Debt change in t=0 terms.            [wad]
        address liquidated, 
        address liquidator,
        address liquidationContract         // Assigned the liquidation debt
    ) external auth {
        require(collateralList.length == collateralChange.length, "LMCV/Missing collateral type or collateral amount");
        uint256 dPrimeChange = normalizedDebtChange * AccumulatedRate;

        // This debt represnts the amount of liquidated user's dPRIME which is still floating around. 
        // We need to burn the same amount of dPRIME raised via auction. Assuming a successful
        // auction, any increase to `protocolDeficit` will be reversed. An auction which raises less
        // than the required dPRIME amount will result in some amount of `protocolDeficit` persisting
        // over time. This means that, on aggregate, dPRIME will be less collateralised than it 
        // previously was.
        totalProtocoldeficit                    += dPrimeChange;
        protocolDeficit[liquidationContract]    += dPrimeChange;

        // Here, we reduce the amount of outstanding debt for the liquidated user and the protocol
        // as a whole because we accounted for it above in `protocolDeficit`. This operation and the one
        // above has the effect of moving the debt to where it will be handled by the liquidation contract.
        // Above, we increase `protocolDeficit` by the dPRIME amount which also takes into account
        // accrued interat interest to date.
        normalizedDebt[liquidated]  -= normalizedDebtChange;
        totalNormalizedDebt         -= normalizedDebtChange;

        // Move collateral from the liquidated user's address to liquidator's address. 
        // This might leave the vault in a dusty state.
        for (uint256 i = 0; i < collateralList.length; i++) {
            bytes32 collateral = collateralList[i];
            CollateralData[collateral].lockedAmount -= collateralChange[i];     // Reduce total locked.
            lockedCollateral[liquidated][collateral] -= collateralChange[i];    // Reduce locked for user.
            unlockedCollateral[liquidator][collateral] += collateralChange[i];  // Increase unlocked for liquidator.
        }

        // Remove collateral from the list of locked collateral indicies if all of it is confiscated
        // by the liquidator. This may happen if the vault in question is small (well below the lot size).
        bytes32[] storage lockedCollats = lockedCollateralList[liquidated];
        for (uint j = lockedCollats.length; j > 0; j--) {
            uint256 iter = j - 1;
            if (lockedCollateral[liquidated][lockedCollats[iter]] == 0) {
                deleteElement(lockedCollats, iter);
            }
        }

        emit Liquidation(liquidated, liquidator, normalizedDebtChange, collateralList, collateralChange);
    }

    /*
     * Only the liquidation contract can settle protocol deficit. In the interests of prudence, every time a vault 
     * is liquidated, the LMCV registers a temporary protocol deficit for the amount being liquidated, with the 
     * intention that the protocol deficit is reversed by the amount of dPRIME raised when the auction concludes.
     * The amount of dPRIME raised via the auction is burnt when this function is called. As such, the total 
     * amount of dPRIME issued and protocol deficit is reduced by the same amount.
     */
    function deflate(uint256 rad) external {
        address u = msg.sender;
        protocolDeficit[u]      -= rad;
        totalProtocoldeficit    -= rad;
        dPrime[u]               -= rad;
        totalDPrime             -= rad;

        emit Deflate(msg.sender, rad);
    }

    /*
     * Debt Receiver is always the protocol's deficit address. The dPRIME receiver can be any address. In effect,
     * this method can be used to issue dPRIME without calling the `loan` function and so the dPRIME created via
     * this function does not increase the `normalisedDebt` balance. Any dPRIME created through this function
     * increases the aggregate LTV of the protocol and so is intended that any resulting increase in protocol
     * deficit be balanced be netted off by an increase in protocol surplus.

     * For example, if we were to pay interest on dPRIME deposits in V2 of the protocol then we would pay the 
     * interest via increasing protocol deficit. This deficit would be offset by the surplus dPRIME received
     * as users pay stability fees on their vaults.
     */
    function inflate(address debtReceiver, address dPrimeReceiver, uint256 rad) external auth {
        protocolDeficit[debtReceiver]   += rad;
        totalProtocoldeficit            += rad;
        dPrime[dPrimeReceiver]          += rad;
        totalDPrime                     += rad;

        emit Inflate(debtReceiver, dPrimeReceiver, rad);
    }

    //
    // Interest rates
    //

    function updateRate(int256 rateIncrease) external auth loanAlive {
        AccumulatedRate     = _add(AccumulatedRate, rateIncrease);
        int256 rad          = _int256(totalNormalizedDebt - totalPSMDebt) * rateIncrease;
        dPrime[Treasury]    = _add(dPrime[Treasury], rad);
        totalDPrime         = _add(totalDPrime, rad);

        emit UpdateRate(rateIncrease);
    }

    //
    // Vault health checking
    //

    /*
     * Calculates a weighted average credit limit based upon the credit limit specified for each
     * collateral type. In V1 of the protocol, the credit limit is only updated when the vault user
     * changes the amount of locked collateral. We are aware that the credit limit will change
     * as collateral spot prices continously change. However, the real-time credit limit can be
     * easily tracked off-chain by some other service.
     *
     * This function checks that the present value of a vault's debt (normalised debt multiplied
     * by stability rate) is less than than the credit limit.
     */
    function isWithinCreditLimit(address user, uint256 rate) private view returns (bool) {
        bytes32[] storage lockedList = lockedCollateralList[user];
        uint256 creditLimit             = 0; // [rad]
        uint256 leverTokenCreditLimit   = 0; // [rad]
        uint256 noLeverageTotal         = 0; // [wad]
        uint256 leverageTotal           = 0; // [rad]
        for (uint256 i = 0; i < lockedList.length; i++) {
            Collateral memory collateralData = CollateralData[lockedList[i]];

            if(lockedCollateral[user][lockedList[i]] > collateralData.dustLevel){
                uint256 collateralValue = lockedCollateral[user][lockedList[i]] * collateralData.spotPrice; // wad*ray -> rad

                if(!collateralData.leveraged){
                    creditLimit += _rmul(collateralValue, collateralData.creditRatio);
                    noLeverageTotal += collateralValue / RAY;
                } else {
                    leverageTotal += collateralValue;
                    leverTokenCreditLimit += _rmul(collateralValue, collateralData.creditRatio);
                }
            }
        }

        // If only leverage tokens exist, just return their credit limit
        // Keep credit ratio low on levered tokens (60% or lower) to incentivize having non levered collateral in the vault
        if(noLeverageTotal == 0 && leverageTotal > 0 && leverTokenCreditLimit >= normalizedDebt[user] * rate){
            return true;
        }

        uint256 leverageMultiple = noLeverageTotal == 0 && leverageTotal == 0 ? RAY : RAY + leverageTotal / noLeverageTotal;

        if (_rmul(creditLimit, leverageMultiple) >= (normalizedDebt[user] * rate)) {
            return true;
        }
        return false;
    }

    //
    // Helpers
    //

    function either(bool x, bool y) internal pure returns (bool z) {
        assembly{ z := or(x, y)}
    }

    //WARNING: Does not care about order
    function deleteElement(bytes32[] storage array, uint256 i) internal {
        require(i < array.length, "Array out of bounds");
        array[i] = array[array.length-1];
        array.pop();
    }

    //
    // Testing
    //

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