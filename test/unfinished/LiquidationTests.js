//IN CASE THE CASES ARE HELPFUL FOR THE LIQUIDATION MODULE


// describe("Liquidation function testing", function () {
    //     it("Liquidation works with 50% liquidation", async function () {

    //         await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

    //         await lmcv.administrate(dPrimeJoin.address, 1);
    //         await dPrime.rely(dPrimeJoin.address);

    //         let userDPrimeJoin = dPrimeJoin.connect(addr1);
    //         await userLMCV.proxyApprove(userDPrimeJoin.address);
    //         await userDPrimeJoin.exit(addr1.address, fwad("3000"));

    //         await lmcv.updateSpotPrice(mockToken2Bytes, fray("8"));
    //         expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2400"));
    //         expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

    //         await lmcv.pushLiquidationDPrime(addr3.address, frad("10000"));


    //         const liquidation = await userThreeLMCV.liquidate(addr1.address, addr3.address, fray(".5"));
    //         // console.log(await liquidation.wait());

    //         expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("1620"));
    //         expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("8500"));
    //         expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("1522.5"));
    //         expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("1522.5"));
    //         expect(await lmcv.ProtocolDebt()).to.equal(frad("1522.5"));
            

    //         expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("33.125"));
    //         expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("66.25"));
    //         expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("132.5"));

    //         let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
    //         expect(collateralType['totalDebt']).to.equal(fwad("33.125"));
    //         let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
    //         expect(collateralType2['totalDebt']).to.equal(fwad("66.25"));
    //         let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
    //         expect(collateralType3['totalDebt']).to.equal(fwad("132.5"));

    //         expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("16.875"));
    //         expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("33.75"));
    //         expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("67.5"));
    //     });

    //     it("liquidates only partialLiqMax depsite user asking for more", async function () {

    //         await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

    //         await lmcv.administrate(dPrimeJoin.address, 1);
    //         await dPrime.rely(dPrimeJoin.address);

    //         let userDPrimeJoin = dPrimeJoin.connect(addr1);
    //         await userLMCV.proxyApprove(userDPrimeJoin.address);
    //         await userDPrimeJoin.exit(addr1.address, fwad("3000"));

    //         await lmcv.updateSpotPrice(mockToken2Bytes, fray("8"));
    //         expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2400"));
    //         expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

    //         await lmcv.pushLiquidationDPrime(addr3.address, frad("10000"));


    //         const liquidation = await userThreeLMCV.liquidate(addr1.address, addr3.address, fray("1000000000")); 
    //         // console.log(await liquidation.wait());

    //         expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("1620"));
    //         expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("8500"));
    //         expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("1522.5"));
    //         expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("1522.5"));
    //         expect(await lmcv.ProtocolDebt()).to.equal(frad("1522.5"));
            

    //         expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("33.125"));
    //         expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("66.25"));
    //         expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("132.5"));

    //         let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
    //         expect(collateralType['totalDebt']).to.equal(fwad("33.125"));
    //         let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
    //         expect(collateralType2['totalDebt']).to.equal(fwad("66.25"));
    //         let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
    //         expect(collateralType3['totalDebt']).to.equal(fwad("132.5"));

    //         expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("16.875"));
    //         expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("33.75"));
    //         expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("67.5"));
    //     });

    //     it("Liquidates a lower portion than partialLiqMax", async function () {

    //         await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

    //         await lmcv.administrate(dPrimeJoin.address, 1);
    //         await dPrime.rely(dPrimeJoin.address);

    //         let userDPrimeJoin = dPrimeJoin.connect(addr1);
    //         await userLMCV.proxyApprove(userDPrimeJoin.address);
    //         await userDPrimeJoin.exit(addr1.address, fwad("3000"));

    //         await lmcv.updateSpotPrice(mockToken2Bytes, fray("8"));
    //         expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2400"));
    //         expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

    //         await lmcv.pushLiquidationDPrime(addr3.address, frad("10000"));


    //         const liquidation = await userThreeLMCV.liquidate(addr1.address, addr3.address, fray(".25")); 
    //         // console.log(await liquidation.wait());

    //         expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("810"));
    //         expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("9250"));
    //         expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("2261.25"));
    //         expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("2261.25"));
    //         expect(await lmcv.ProtocolDebt()).to.equal(frad("2261.25"));
            

    //         expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("41.5625"));
    //         expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("83.125"));
    //         expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("166.25"));

    //         let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
    //         expect(collateralType['totalDebt']).to.equal(fwad("41.5625"));
    //         let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
    //         expect(collateralType2['totalDebt']).to.equal(fwad("83.125"));
    //         let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
    //         expect(collateralType3['totalDebt']).to.equal(fwad("166.25"));

    //         expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("8.4375"));
    //         expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("16.875"));
    //         expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("33.75"));
    //     });

    //     it("Liquidates 100% of dPrime value because of high account insolvency percentage", async function () {
    //         await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

    //         await lmcv.administrate(dPrimeJoin.address, 1);
    //         await dPrime.rely(dPrimeJoin.address);

    //         let userDPrimeJoin = dPrimeJoin.connect(addr1);
    //         await userLMCV.proxyApprove(userDPrimeJoin.address);
    //         await userDPrimeJoin.exit(addr1.address, fwad("3000"));

    //         await lmcv.updateSpotPrice(mockToken2Bytes, fray("10"));
    //         await lmcv.updateSpotPrice(mockToken3Bytes, fray("5"));
    //         expect(await lmcv.getPortfolioValue(addr1.address)).to.equal(frad("4000"));
    //         expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2000"));
    //         expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

    //         await lmcv.pushLiquidationDPrime(addr3.address, frad("10000"));
    //         await userThreeLMCV.liquidate(addr1.address, addr3.address, fray("1")); 

    //         expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("3240"));
    //         expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("7000"));
    //         expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("45"));
    //         expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("45"));
    //         expect(await lmcv.ProtocolDebt()).to.equal(frad("45"));
            

    //         expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("9.5"));
    //         expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("19"));
    //         expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("38"));

    //         let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
    //         expect(collateralType['totalDebt']).to.equal(fwad("9.5"));
    //         let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
    //         expect(collateralType2['totalDebt']).to.equal(fwad("19"));
    //         let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
    //         expect(collateralType3['totalDebt']).to.equal(fwad("38"));

    //         expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("40.5"));
    //         expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("81"));
    //         expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("162"));
    //     });

    //     it("Fails to liquidate because account is still healthy", async function () {
    //         await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

    //         await lmcv.administrate(dPrimeJoin.address, 1);
    //         await dPrime.rely(dPrimeJoin.address);

    //         let userDPrimeJoin = dPrimeJoin.connect(addr1);
    //         await userLMCV.proxyApprove(userDPrimeJoin.address);
    //         await userDPrimeJoin.exit(addr1.address, fwad("3000"));
    //         await lmcv.pushLiquidationDPrime(addr3.address, frad("10000"));

    //         await expect(userThreeLMCV.liquidate(addr1.address, addr3.address, fray(".25"))).to.be.revertedWith("LMCV/Vault is healthy");
    //     });

    //     it("Can't liquidate because they don't have enough dPrime", async function () {

    //         await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

    //         await lmcv.administrate(dPrimeJoin.address, 1);
    //         await dPrime.rely(dPrimeJoin.address);

    //         let userDPrimeJoin = dPrimeJoin.connect(addr1);
    //         await userLMCV.proxyApprove(userDPrimeJoin.address);
    //         await userDPrimeJoin.exit(addr1.address, fwad("3000"));

    //         await lmcv.updateSpotPrice(mockToken2Bytes, fray("10"));
    //         await lmcv.updateSpotPrice(mockToken3Bytes, fray("5"));
    //         expect(await lmcv.getPortfolioValue(addr1.address)).to.equal(frad("4000"));
    //         expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2000"));
    //         expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);
    //         await lmcv.pushLiquidationDPrime(addr3.address, frad("2000"));

    //         await expect(userThreeLMCV.liquidate(addr1.address, addr3.address, fray("1"))).to.be.revertedWith("LMCV/Not enough liquidation dPrime available");
    //     });

    //     it("Liquidates 100% of dPrime value because value lower than liq floor", async function () {
    //         await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

    //         await lmcv.setLiquidationFloor(frad("10000"));
    //         await lmcv.setWholeCDPLiqMult(fray(".8"));

    //         await lmcv.administrate(dPrimeJoin.address, 1);
    //         await dPrime.rely(dPrimeJoin.address);

    //         let userDPrimeJoin = dPrimeJoin.connect(addr1);
    //         await userLMCV.proxyApprove(userDPrimeJoin.address);
    //         await userDPrimeJoin.exit(addr1.address, fwad("3000"));

    //         await lmcv.updateSpotPrice(mockToken2Bytes, fray("10"));
    //         await lmcv.updateSpotPrice(mockToken3Bytes, fray("5"));
    //         expect(await lmcv.getPortfolioValue(addr1.address)).to.equal(frad("4000"));
    //         expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2000"));
    //         expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

    //         await lmcv.pushLiquidationDPrime(addr3.address, frad("10000"));
    //         await userThreeLMCV.liquidate(addr1.address, addr3.address, fray("1")); 

    //         expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("3240"));
    //         expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("7000"));
    //         expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("45"));
    //         expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("45"));
    //         expect(await lmcv.ProtocolDebt()).to.equal(frad("45"));
            

    //         expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("9.5"));
    //         expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("19"));
    //         expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("38"));

    //         let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
    //         expect(collateralType['totalDebt']).to.equal(fwad("9.5"));
    //         let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
    //         expect(collateralType2['totalDebt']).to.equal(fwad("19"));
    //         let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
    //         expect(collateralType3['totalDebt']).to.equal(fwad("38"));

    //         expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("40.5"));
    //         expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("81"));
    //         expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("162"));
    //     });

    //     it("Removal of protocol fee because valueRatio got too high", async function () {
    //         await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

    //         await lmcv.setProtocolFeeRemovalMult(fray(".75"));

    //         await lmcv.administrate(dPrimeJoin.address, 1);
    //         await dPrime.rely(dPrimeJoin.address);

    //         let userDPrimeJoin = dPrimeJoin.connect(addr1);
    //         await userLMCV.proxyApprove(userDPrimeJoin.address);
    //         await userDPrimeJoin.exit(addr1.address, fwad("3000"));

    //         await lmcv.updateSpotPrice(mockToken2Bytes, fray("10"));
    //         await lmcv.updateSpotPrice(mockToken3Bytes, fray("5"));
    //         expect(await lmcv.getPortfolioValue(addr1.address)).to.equal(frad("4000"));
    //         expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2000"));
    //         expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

    //         await lmcv.pushLiquidationDPrime(addr3.address, frad("10000"));
    //         await userThreeLMCV.liquidate(addr1.address, addr3.address, fray("1")); 

    //         expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("3240"));
    //         expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("7000"));
    //         expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("0"));
    //         expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("0"));
    //         expect(await lmcv.ProtocolDebt()).to.equal(frad("0"));
            

    //         expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("9.5"));
    //         expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("19"));
    //         expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("38"));

    //         let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
    //         expect(collateralType['totalDebt']).to.equal(fwad("9.5"));
    //         let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
    //         expect(collateralType2['totalDebt']).to.equal(fwad("19"));
    //         let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
    //         expect(collateralType3['totalDebt']).to.equal(fwad("38"));

    //         expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("40.5"));
    //         expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("81"));
    //         expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("162"));
    //     });

    //     it("Insolvency percentage at 93.75%, liq fee at whatever is left and no protocol fee", async function () {
    //         await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

    //         await lmcv.administrate(dPrimeJoin.address, 1);
    //         await dPrime.rely(dPrimeJoin.address);

    //         let userDPrimeJoin = dPrimeJoin.connect(addr1);
    //         await userLMCV.proxyApprove(userDPrimeJoin.address);
    //         await userDPrimeJoin.exit(addr1.address, fwad("3000"));

    //         await lmcv.updateSpotPrice(mockTokenBytes, fray("20"));
    //         await lmcv.updateSpotPrice(mockToken2Bytes, fray("12"));
    //         await lmcv.updateSpotPrice(mockToken3Bytes, fray("5"));
    //         expect(await lmcv.getPortfolioValue(addr1.address)).to.equal(frad("3200"));
    //         expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("1600"));
    //         expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

    //         await lmcv.pushLiquidationDPrime(addr3.address, frad("10000"));
    //         await userThreeLMCV.liquidate(addr1.address, addr3.address, fray("1")); 

    //         expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("3200"));
    //         expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("7000"));
    //         expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("0"));
    //         expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("0"));
    //         expect(await lmcv.ProtocolDebt()).to.equal(frad("0"));
            

    //         expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("0"));
    //         expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("0"));
    //         expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("0"));

    //         let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
    //         expect(collateralType['totalDebt']).to.equal(fwad("0"));
    //         let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
    //         expect(collateralType2['totalDebt']).to.equal(fwad("0"));
    //         let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
    //         expect(collateralType3['totalDebt']).to.equal(fwad("0"));

    //         expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("50"));
    //         expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("100"));
    //         expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("200"));
    //     });

    //     it("Insolvency percentage at 101.7%, liquidator takes a loss on the trade", async function () {
    //         await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

    //         await lmcv.administrate(dPrimeJoin.address, 1);
    //         await dPrime.rely(dPrimeJoin.address);

    //         let userDPrimeJoin = dPrimeJoin.connect(addr1);
    //         await userLMCV.proxyApprove(userDPrimeJoin.address);
    //         await userDPrimeJoin.exit(addr1.address, fwad("3000"));

    //         await lmcv.updateSpotPrice(mockTokenBytes, fray("20"));
    //         await lmcv.updateSpotPrice(mockToken2Bytes, fray("9.5"));
    //         await lmcv.updateSpotPrice(mockToken3Bytes, fray("5"));
    //         expect(await lmcv.getPortfolioValue(addr1.address)).to.equal(frad("2950"));
    //         expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("1475"));
    //         expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

    //         await lmcv.pushLiquidationDPrime(addr3.address, frad("10000"));
    //         await userThreeLMCV.liquidate(addr1.address, addr3.address, fray("1")); 

    //         expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("2950"));
    //         expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("7000"));
    //         expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("0"));
    //         expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("0"));
    //         expect(await lmcv.ProtocolDebt()).to.equal(frad("0"));
            

    //         expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("0"));
    //         expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("0"));
    //         expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("0"));

    //         let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
    //         expect(collateralType['totalDebt']).to.equal(fwad("0"));
    //         let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
    //         expect(collateralType2['totalDebt']).to.equal(fwad("0"));
    //         let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
    //         expect(collateralType3['totalDebt']).to.equal(fwad("0"));

    //         expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("50"));
    //         expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("100"));
    //         expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("200"));
    //     });

    //     it("Withdrawn dPrime hits 0 when full liquidation because withdrawDPrime < debtDPrime", async function () {
    //         await userLMCV.loan(collateralBytesList, [fwad("50"), fwad("100"), fwad("200")], fwad("3000"), addr1.address);

    //         await lmcv.administrate(dPrimeJoin.address, 1);
    //         await dPrime.rely(dPrimeJoin.address);

    //         let userDPrimeJoin = dPrimeJoin.connect(addr1);
    //         await userLMCV.proxyApprove(userDPrimeJoin.address);
    //         await userDPrimeJoin.exit(addr1.address, fwad("1500"));

    //         expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("3000"));
    //         expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("1500"));
            

    //         await lmcv.updateSpotPrice(mockToken2Bytes, fray("10"));
    //         await lmcv.updateSpotPrice(mockToken3Bytes, fray("5"));
    //         expect(await lmcv.getPortfolioValue(addr1.address)).to.equal(frad("4000"));
    //         expect(await lmcv.getMaxDPrime(addr1.address)).to.equal(frad("2000"));
    //         expect(await userLMCV.isHealthy(addr1.address)).to.equal(false);

    //         await lmcv.pushLiquidationDPrime(addr3.address, frad("10000"));
    //         await userThreeLMCV.liquidate(addr1.address, addr3.address, fray("1")); 

    //         expect(await lmcv.getUnlockedCollateralValue(addr3.address, collateralBytesList)).to.equal(frad("3240"));
    //         expect(await lmcv.liqDPrime(addr3.address)).to.equal(frad("7000"));
    //         expect(await lmcv.debtDPrime(addr1.address)).to.equal(frad("45"));
    //         expect(await lmcv.withdrawnDPrime(addr1.address)).to.equal(frad("0"));
    //         expect(await lmcv.ProtocolDebt()).to.equal(frad("45"));
            

    //         expect(await lmcv.lockedCollateral(addr1.address, mockTokenBytes)).to.equal(fwad("9.5"));
    //         expect(await lmcv.lockedCollateral(addr1.address, mockToken2Bytes)).to.equal(fwad("19"));
    //         expect(await lmcv.lockedCollateral(addr1.address, mockToken3Bytes)).to.equal(fwad("38"));

    //         let collateralType = await lmcv.CollateralTypes(mockTokenBytes);
    //         expect(collateralType['totalDebt']).to.equal(fwad("9.5"));
    //         let collateralType2 = await lmcv.CollateralTypes(mockToken2Bytes);
    //         expect(collateralType2['totalDebt']).to.equal(fwad("19"));
    //         let collateralType3 = await lmcv.CollateralTypes(mockToken3Bytes);
    //         expect(collateralType3['totalDebt']).to.equal(fwad("38"));

    //         expect(await lmcv.unlockedCollateral(addr3.address, mockTokenBytes)).to.equal(fwad("40.5"));
    //         expect(await lmcv.unlockedCollateral(addr3.address, mockToken2Bytes)).to.equal(fwad("81"));
    //         expect(await lmcv.unlockedCollateral(addr3.address, mockToken3Bytes)).to.equal(fwad("162"));
    //     });
    // });