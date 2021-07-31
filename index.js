var express = require('express');
var axios = require("axios").default;
var WebSocketClient = require('websocket').client;
var wsclient = new WebSocketClient();
var app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

var ethers = require("ethers");

// a demo long running websocket listener on geth(using ethers js)
// this can be used as a kicker to the chainlink initiator to start registered jobs
// based on even(say something happens on L2 chain and pickup and notify L1 chain)
var watchGethNode = function () {
    var url = "ws://localhost:8545";
    var customWsProvider = new ethers.providers.WebSocketProvider(url);

    // customWsProvider.on("pending", (tx) => {
    //     customWsProvider.getTransaction(tx).then(function (transaction) {
    //         console.log(transaction);
    //     });
    // });

    customWsProvider.on("block", (block) => {
        console.log(block);
        customWsProvider
            //.getBlockWitTransactions(block)
            .getBlock(block)
            .then(function (block) {
                console.log(block);
                block.transactions.forEach(txHashOrTx => {
                    if (typeof txHashOrTx === "string") {
                        customWsProvider.getTransaction(txHashOrTx).then(tx => {
                            console.log(tx);
                        });
                    }
                    else {
                        console.log(txHashOrTx);
                    }
                });
            });
    });

    customWsProvider._websocket.on("error", async () => {
        console.log(`Unable to connect to ${url} retrying in 3s...`);
        setTimeout(watchGethNode, 3000);
    });
    customWsProvider._websocket.on("close", async (code) => {
        console.log(
            `Connection lost with code ${code}! Attempting reconnect in 3s...`
        );
        customWsProvider._websocket.terminate();
        setTimeout(watchGethNode, 3000);
    });
};

// watchGethNode();

//Define some constants
//when we access chainlink to kick start jobs when external even happens
//this is generated from
//FEATURE_EXTERNAL_INITIATORS=true chainlink initiators <name> <job_registration_url_of_this>
//correspond to the access key and secret 'columns'
const OUR_CHAINLINK_ACCESS_KEY = "cfebb6e3c2464afe8d9babe8eed689fe"
const OUR_CHAINLINK_ACCESS_SECRET = "LAwmwi5Gdkn/mTc/1BiBhGtrtouW6UQ1LEntY7EtgY8IMBB1rttlmpyAynlyyvXR"
//the root chainlink node url to kick start a job when something happens
const CHAINLINK_IP = "http://localhost:6688"
//present in the header when chainlink do jobs registration and/or job delete
//correspond to the last to column of the chainlink initiators command(outgoing token)
//should verify this to make sure the call is from legit source(chainlink node) 
const THEIR_CHAINLINK_ACCESS_KEY = "9g1Yk9laC2NG8KtIHHuImr0fDSr7Yfp+zIzmgldB9dj1c5XYXYBXCc2QEp3swci6"
const THEIR_CHAINLINK_ACCESS_SECRET = "SSi1o3aPQnhvTJjViH559+XLkoZ4utsfyGwPUmrKCqiF28IDhuE9mtqSQqQqs2FD"
//incoming token(when calling chainlink from external adapter(EA), i.e. this)
//this token appear only once during chainlink bridge creation
//this is only needed if the callback feature of the EA is desired
const INCOMING_TOKEN = "JjyZGD3IF+XjxEjTK2ZOPJ1hCC2THQ66"
//outgoing token(when chainlink calling EA), this value is shown in the bridge tab of the chainlink node UI
//present in the header when chainlink call this, should verify before action
const OUTGOING_TOKEN = "mPs4+AsKb9aDZuOsEhX41zRJeG50WgDR"

//local store for job_ids registered to the external initiator(demo only, should use persistent storage)
var job_ids = []

/** Health check endpoint */
app.get('/', function (req, res) {
    console.log("health check");
    res.sendStatus(200);
})

/* loopbackup test, kick start the initiator then callback the EA endpoint(without going through chainlink node) */
app.get('/loopback', function (req, res) {
    console.log("lookback check");
    callChainlinkNode(0);
    res.sendStatus(200);
})

// simulate external event of inititator to kick start jobs(testing only)
app.get('/kick', function (req, res) {
    console.log("simulate ei event");
    runActiveJobs();
    res.sendStatus(200);
}
);

/** Called by chainlink node when a job is created using this external initiator, where the chainlink initiators <name> <url> points to */
app.post('/jobs', function (req, res) {
    var headers = JSON.stringify(req.headers);
    var body = JSON.stringify(req.body);

    console.log(`register job ${headers} ${body}`);

    //Recieves info from node about the job id
    var their_access_key = req.headers["x-chainlink-ea-accesskey"];
    var their_access_secret = req.headers["x-chainlink-ea-secret"];
    // match pre-arranged header key
    if (THEIR_CHAINLINK_ACCESS_KEY === their_access_key && THEIR_CHAINLINK_ACCESS_SECRET === their_access_secret) {
        job_ids.push(req.body.jobId) //save the job id
        res.sendStatus(200);
    }
    else {
        res.sendStatus(403);
    }
});
/* called when chainlink want to remove a job from the initiator */
app.delete('/jobs/:jobId', function (req, res) {
    var params = JSON.stringify(req.params)
    var query = JSON.stringify(req.query);
    var headers = JSON.stringify(req.headers);
    var body = JSON.stringify(req.body);
    var their_access_key = req.headers["x-chainlink-ea-accesskey"];
    var their_access_secret = req.headers["x-chainlink-ea-secret"];
    if (THEIR_CHAINLINK_ACCESS_KEY === their_access_key && THEIR_CHAINLINK_ACCESS_SECRET === their_access_secret) {
        // should remove from the store
        console.log(`delete ${params} ${headers} ${body} ${query}`);
    }
    res.sendStatus(200);

});

/** Called by chainlink node when used as external adapter */
app.post("/doSomething", function (req, res) {
    console.log(req.headers);
    console.log(req.body);
    var their_access_key = req.headers["x-chainlink-ea-accesskey"];
    var their_access_secret = req.headers["x-chainlink-ea-secret"];
    var outgoing_token = req.headers['authorization'];
    var pending = { pending: true };
    var result = { data: { foo: 1, bar: [1, 2, 3, 4] } };
    var err = { error: { code: 1, message: 'wrong' } };
    var responseUrl = req.body.responseURL;

    // should verify proper token from chainlink before proceed
    // authorization: bearer <token>
    // make sure it is case insensitive EXCEPT the token string itself
    if (true || outgoing_token === ("bearer " + OUTGOING_TOKEN)) {
        if (responseUrl) {
            //res.status(200).json(result); // return immediately
            //res.status(200).json(error);  // return error
            res.status(200).json(pending);  // long running so do it async(via call back)
            setTimeout(() => {
                /* after long running task, send back the result via postback */
                postbackEAResult(responseUrl, result);
            }, 1000);
        }
        else {
            // not support async, do something and return here
            res.status(200).json(result);
            //res.status(200).json(error);  // return error
        }
    } else {
        res.sendStatus(403);
    }
});

// once off job(not used)
function updateCurrentActiveJob() {
    while (job_ids.length) {
        // take jobid from outstanding(and remove them via shift/pop)
        // From first to last...
        var job_id = job_ids.shift();
        // From last to first...
        // var job_id = job_ids.pop();
        try {
            console.log(`handling job id ${job_id}`);
        } catch (error) {
            console.log('error handling job id ${job_id} ${error}');
        }
    }
}

// run all registered active jobs 
function runActiveJobs() {
    job_ids.forEach(jobId => {
        try {
            callChainlinkNode(jobId);
        }
        catch (error) {
            console.log(error);
        }
    });
}

/** Function to call the chainlink node and run a job, should be triggered by external event of the initiator */
function callChainlinkNode(jobId) {
    var url_addon = '/v2/specs/' + jobId + '/runs';
    axios({
        method: 'post',
        url: jobId
            ? CHAINLINK_IP + url_addon
            : 'http://localhost:' + (process.env.PORT || 3002) + '/jobs',
        headers: {
            'content-type': 'application/json',
            /* must supplied the key/secret during initiator creation or this would be rejected */
            'X-Chainlink-EA-AccessKey': OUR_CHAINLINK_ACCESS_KEY,
            'X-Chainlink-EA-Secret': OUR_CHAINLINK_ACCESS_SECRET
        },
        /* data to be sent, must be json */
        data: {
            jobId: 1
        }
    }).then(result => {
        console.log(`invoke chainlink job ${result}`);
    }).catch(error => {
        console.log(error);
    }).finally(() => {
        console.log('job run finally');
    });
}

/** Function to return run result, async */
function postbackEAResult(responseUrl, result) {
    axios({
        method: 'patch', // it is a 'PATCH' request, not POST/UPDATE
        url: responseUrl,
        headers: {
            'content-type': 'application/json',
            /* must supplied this or it would be rejected */
            'Authorization': 'Bearer ' + INCOMING_TOKEN
        },
        data: result
    }).then(result => {
        console.log('postback result');
        console.log(result);
    }).catch(error => {
        console.log(error);
    }).finally(() => {
        console.log('postback finally');
    });
}

//DEFINE SOME POLLING FUNCTION / SUBSCRIBE TO SOME WEBHOOK / DEFINE WHEN TO CALL CHAINLINK NODE

var server = app.listen(process.env.PORT || 3002, function () {
    var port = server.address().port;
    console.log("App now running on port", port);
});
