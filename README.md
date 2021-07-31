# chainlink-adapter-initiator
a simple single file nodejs project showing how to write chainlink(v1) external adapter and initiator

while there are documents and some sample templates from both official chainlink account on github as well as some other sources, all of them are over complicated(unnecessary so). 

This is a single index.js file that show case the minimal(but essential functions) that is needed in order to implement a chainlink external adapter as well as external initiator, so it can be used as both at the same time or for their individual functionality.

so basically a documentation in code that can be tested.

the initiator is created as below(matching the sample job.json)

FEATURE_EXTERNAL_INITIATORS=true chainlink initiators geth5watch http://localhost:3002/jobs

the documentations for chainlink(as node operator/developer)

https://docs.chain.link/chainlink-nodes/
