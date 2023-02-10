These tasks can be used for mock, test and prod networks. 

When using the `d2o-balance` task you ust pass an `--env` parameter set to `mock` for use with a mock network... This is because we deploy two d2o's to the same network and thus display two balances and so won't work with networks where only a single d2o contract is deployed.