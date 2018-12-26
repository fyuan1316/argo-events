/*
* The gateway listens to live twits and generates events.
*/

const http = require('http');
const clientPort = process.env["GATEWAY_PROCESSOR_CLIENT_HTTP_PORT"];

// init express server
const express = require('express');
const app = express();
const port = 3000;

// get kubernetes client
const Client = require('kubernetes-client').Client;
const config = require('kubernetes-client').config;
const client = new Client({ config: config.getInCluster() });

// twitter client
const Twit = require('twit');

// hold twitter streams
let allStreams = {};

// process new configuration
app.get("/start", async (req, res) => {
    body = req.body;

    // get secret that holds twitter creds
    const secretName = body["creds"];
    const secret = await client.apis.v1.namespaces(body.namespace).secrets(secretName).get();

    // read consumer key
    const consumerKeyName = body["consumerKey"];
    const consumerKeyData = secret.body.data[consumerKeyName];
    let buff = new Buffer(consumerKeyData, 'base64');
    let consumerKey = buff.toString('ascii');

    // read consumer secret
    const consumerSecretName = body["consumerSecret"];
    const consumerSecretData = secret.body.data[consumerSecretName];
    buff = new Buffer(consumerSecretData, 'base64');
    let consumerSecret = buff.toString('ascii');

    // read access token
    const accessTokenName = body["accessToken"];
    const accessTokenData = secret.body.data[accessTokenName];
    buff = new Buffer(accessTokenData, 'base64');
    let accessToken = buff.toString('ascii');

    // read access token secret
    const accessTokenSecretName = body['accessTokenSecret'];
    const accessTokenSecretData = secret.body.data[accessTokenSecretName];
    buff = new Buffer(accessTokenData, 'base64');
    let accessTokenSecret = buff.toString('ascii');

    var T = new Twit({
        consumer_key:         consumerKey,
        consumer_secret:      consumerSecret,
        access_token:         accessToken,
        access_token_secret:  accessTokenSecret,
        strictSSL:            false,     // optional - requires SSL certificates to be valid.
    });

    //  stream a sample of public statuses
    var stream = T.stream('statuses/sample')

    allStreams[body.src] = stream;

    // apply filter if any
    if(body["filter"]) {
        stream = T.stream('statuses/filter', body["filter"])
    }

    stream.on('tweet', function (tweet) {
        let post_options = {
            host: 'localhost',
            port: clientPort,
            path: '/event',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        };

        let post_req = http.request(post_options, (res) => {
        });
        post_req.write({
            src: body.src,
            payload: Buffer.from(JSON.stringify(tweet)),
        });
        post_req.end();
    });

});

// stop an existing configuration
app.get("/stop", (req, res) => {
    let stream = allStreams[body.src];
    stream.stop();
});
