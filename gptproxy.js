const http = require('http');
const ssl = require('ssl');
const io = require('io');
const db = require('db');
const path = require('path');
const crypto = require('crypto');
const util = require('util');

const OPENAI_API_KEY = 'sk-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
const OPENAI_API_ENTRY = 'api.openai.com';
const GITLAB_API_ENTRY = 'git.corp.com';

const hc = new http.Client();
const cache = new util.LruCache(100, 60000);
const timeout = 90000;

function get_embedding(text) {
    var res = http.post(`https://${OPENAI_API_ENTRY}/v1/embeddings`, {
        headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        json: {
            "input": text,
            "model": "text-embedding-ada-002"
        }
    });

    if (res.statusCode > 300)
        throw new Error(res.json().error.message);

    return res.json();
}

const dbconn = db.open('sqlite:docs.db');
const prompt = `You are a fibjs development assistant, please answer the question strictly based on the following information in the most detail , do not refer to the nodejs documentation and source code`;
const modules = `fibjs has the following modules built in: ${util.buildInfo().modules.join(',')}`;

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

                    req.setHeader('Authorization', `Bearer ${OPENAI_API_KEY}`);
                }

                if (!upconn) {
                    upconn = ssl.connect(`ssl://${OPENAI_API_ENTRY}:443`);
                    upconn.stream.timeout = timeout;
                    upconn.copyTo(conn, (err, bytes) => {
                        conn.close(() => { });
                        upconn.close(() => { });
                    });
                }

                if (req.address === '/v1/chat/completions') {
                    var r = req.json();
                    var sz = r.messages.length;

                    if (r.messages[sz - 1].content.toLowerCase().indexOf('fibjs') >= 0
                        || r.messages[0].content.toLowerCase().indexOf('fibjs') >= 0) {
                        var ask_embedding = get_embedding(r.messages[sz - 1].content);

                        var content = [];
                        var content_tokens = 0;

                        var res = dbconn.execute(`SELECT docs.text, docs.total_tokens, distance FROM doc_index, docs WHERE vec_search(doc_index.vec, "${JSON.stringify(ask_embedding.data[0].embedding)}:50") AND docs.rowid = doc_index.rowid ORDER BY distance`);
                        console.log('top distance:', res[0].distance);
                        for (var i = 0; i < res.length; i++) {
                            if (content_tokens < 2000) {
                                content.push(res[i].text);
                                content_tokens += res[i].total_tokens;
                            }
                            else
                                break;
                        }

                        r.messages = [
                            {
                                role: 'system',
                                content: prompt
                            },
                            {
                                role: 'assistant',
                                content: modules
                            },
                            {
                                role: 'assistant',
                                content: content.join('\n')
                            },
                            {
                                role: 'user',
                                content: r.messages[sz - 1].content
                            }
                        ];

                        req.json(r);
                    }
                }

                req.setHeader('Host', OPENAI_API_ENTRY);
                req.sendTo(upconn);
            }
        } finally {
            conn.close(() => { });
            if (upconn)
                upconn.close(() => { });
        }
    });

svr.start();
