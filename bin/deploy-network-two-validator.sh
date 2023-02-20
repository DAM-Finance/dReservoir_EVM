export CONFIG_FILES=./agent_config.json
export HYP_VALIDATOR_ORIGINCHAINNAME=testtwo
export HYP_BASE_CHAINS_TESTTWO_CONNECTION_URL=http://127.0.0.1:13372/
export HYP_VALIDATOR_REORGPERIOD=0
export HYP_VALIDATOR_INTERVAL=5
export HYP_VALIDATOR_CHECKPOINTSYNCER_TYPE=localStorage
export HYP_VALIDATOR_CHECKPOINTSYNCER_PATH=./storage/validatortwo
export HYP_VALIDATOR_VALIDATOR_TYPE=hexKey
export HYP_VALIDATOR_VALIDATOR_KEY=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6 # account 3 0x90F79bf6EB2c4f870365E785982E1f101E93b906
export HYP_BASE_METRICS=9092
export HYP_BASE_TRACING_LEVEL=info
export HYP_BASE_TRACING_FMT=pretty

./validator
