const http = require('http');
const ssl = require('ssl');
const io = require('io');
const path = require('path');
const crypto = require('crypto');
const util = require('util');

const OPENAI_API_KEY = 'sk-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
const OPENAI_API_ENTRY = 'api.openai.com';
const GITLAB_API_ENTRY = 'git.corp.com';

const hc = new http.Client();
const cache = new util.LruCache(100, 60000);
const timeout = 90000;

const svr = new ssl.Server(
    crypto.loadCert(path.join(__dirname, 'cert.pem')), crypto.loadPKey(path.join(__dirname, 'key.pem')),
    443, conn => {
        if (conn.stream)
            conn.stream.timeout = timeout;
        else
            conn.timeout = timeout;

        var upconn;
        const bs = new io.BufferedStream(conn);
        bs.EOL = '\r\n';

        try {
            while (true) {
                const req = new http.Request();
                req.readFrom(bs);

                const auth = req.headers["Authorization"];
                if (auth && auth.substr(0, 7) === 'Bearer ') {
                    const token = auth.substr(7);

                    cache.get(token, token => {
                        console.log(token);
                        var res = hc.get(`https://${GITLAB_API_ENTRY}/api/v4/version`, {
                            headers: {
                                'PRIVATE-TOKEN': token
                            }
                        });

                        if (res.statusCode > 300)
                            throw new Error(res.json().message);

                        return true;
                    });
                }

                if (!upconn) {
                    upconn = ssl.connect(`ssl://${OPENAI_API_ENTRY}:443`);
                    upconn.stream.timeout = timeout;
                    upconn.copyTo(conn, (err, bytes) => {
                        conn.close(() => { });
                        upconn.close(() => { });
                    });
                }

                req.removeHeader('PRIVATE-TOKEN');
                req.setHeader('Host', OPENAI_API_ENTRY);
                req.setHeader('Authorization', `Bearer ${OPENAI_API_KEY}`);

                req.sendTo(upconn);
            }
        } finally {
            conn.close(() => { });
            upconn.close(() => { });
        }
    });

svr.start();
