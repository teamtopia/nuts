console.log("bin/web setting up...");
const express = require('express');
const app = express();
const uuid = require('uuid');
const basicAuth = require('basic-auth');
const Analytics = require('analytics-node');
const nuts = require('../');
const dotenv = require('dotenv');
dotenv.config();

var fs = require('fs');
var https = require('https');
const http = require('http');

var server = null;


if (process.env.AIRBRAKE_ID && process.env.AIRBRAKE_KEY) {
    try {
        if (process.env.AIRBRAKE_HOST) {
            process.env.AIRBRAKE_SERVER = process.env.AIRBRAKE_HOST;
        }
        var airbrake = require('airbrake').createClient(process.env.AIRBRAKE_ID, process.env.AIRBRAKE_KEY);
        airbrake.handleExceptions();
    } catch (e) {
        console.error("Initializing airbrake failed", e);
    }
}

if (process.env.NODE_ENV !== 'production') {
    server = http.createServer({}, app);
} else {
    server = https.createServer({
        key: fs.readFileSync(process.env.HTTPS_KEY, 'utf8'),
        cert: fs.readFileSync(process.env.HTTPS_CERT, 'utf8'),
        ca: fs.readFileSync(process.env.HTTPS_CA, 'utf8'),
        requestCert: true,
        rejectUnauthorized: false
    }, app);
}

var apiAuth = {
    username: process.env.API_USERNAME,
    password: process.env.API_PASSWORD
};

var analytics = undefined; //eslint-disable-line no-undef-init
var downloadEvent = process.env.ANALYTICS_EVENT_DOWNLOAD || 'download';
if (process.env.ANALYTICS_TOKEN) {
    analytics = new Analytics(process.env.ANALYTICS_TOKEN);
}

var myNuts = nuts.Nuts({
    repository: process.env.GITHUB_REPO,
    token: process.env.GITHUB_TOKEN,
    endpoint: process.env.GITHUB_ENDPOINT,
    username: process.env.GITHUB_USERNAME,
    password: process.env.GITHUB_TOKEN,
    timeout: process.env.VERSIONS_TIMEOUT,
    cache: process.env.VERSIONS_CACHE,
    refreshSecret: process.env.GITHUB_SECRET,
    proxyAssets: !process.env.DONT_PROXY_ASSETS
});

//Control access to API
myNuts.before('api', function (access, next) {
    if (!apiAuth.username) return next();

    function unauthorized() {
        next(new Error('Invalid username/password for API'));
    }

    var user = basicAuth(access.req);
    if (!user || !user.name || !user.pass) {
        return unauthorized();
    }

    if (user.name === apiAuth.username && user.pass === apiAuth.password) {
        return next();
    } else {
        return unauthorized();
    }
});

//Log download
myNuts.before('download', function (download, next) {
    console.log('download', download.platform.filename, 'for version', download.version.tag, 'on channel', download.version.channel, 'for', download.platform.type);

    next();
});
myNuts.after('download', function (download, next) {
    console.log('downloaded', download.platform.filename, 'for version', download.version.tag, 'on channel', download.version.channel, 'for', download.platform.type);

    //Track on segment if enabled
    if (analytics) {
        var userId = download.req.query.user;

        analytics.track({
            event: downloadEvent,
            anonymousId: userId ? null : uuid.v4(),
            userId: userId,
            properties: {
                version: download.version.tag,
                channel: download.version.channel,
                platform: download.platform.type,
                os: nuts.platforms.toType(download.platform.type)
            }
        });
    }

    next();
});

if (process.env.TRUST_PROXY) {
    try {
        var trustProxyObject = JSON.parse(process.env.TRUST_PROXY);
        app.set('trust proxy', trustProxyObject);
    } catch (e) {
        app.set('trust proxy', process.env.TRUST_PROXY);
    }
}

app.use(myNuts.router);

//Error handling
app.use(function (req, res, next) {
    res.status(404).send('Page not found');
});
app.use(function (err, req, res, next) {
    var msg = err.message || err;
    var code = 500;

    console.error(err.stack || err);

    //Return error
    res.format({
        'text/plain': function () {
            res.status(code).send(msg);
        },
        'text/html': function () {
            res.status(code).send(msg);
        },
        'application/json': function () {
            res.status(code).send({
                error: msg,
                code: code
            });
        }
    });
});

myNuts.init()

    //Start the HTTP server
    .then(function () {
        server.listen(process.env.PORT || 5000, () => {
            var host = server.address().address;
            var port = server.address().port;

            console.log('Listening at http(s)://%s:%s', host, port);
        });
    }, function (err) {
        console.log(err.stack || err);
        process.exit(1);
    });
