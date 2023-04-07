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
const cache = new util.LruCache(100, 24 * 60 * 1000);
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
const prompt = `You are a fibjs development assistant, please answer the questions and explain in detail strictly based on the above information.
Ignore outlier search results which has nothing to do with the question.
For questions that are not related to fibjs, ChatGPT should reject them and inform the user that "Your question is not related to fibjs. Please provide a fibjs-related question."
Avoid any references to current or past political figures or events, as well as historical figures or events that may be controversial or divisive.`;

const svr = new ssl.Server(
    crypto.loadCert(path.join(__dirname, 'cert.pem')), crypto.loadPKey(path.join(__dirname, 'key.pem')),
    443, conn => {
        // if (conn.stream)
        //     conn.stream.timeout = timeout;
        // else
        //     conn.timeout = timeout;

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
                    // upconn.stream.timeout = timeout;
                    upconn.copyTo(conn, (err, bytes) => {
                        conn.close(() => { });
                        upconn.close(() => { });
                    });
                }

                console.log(req.method, req.address);

                if (req.method === 'POST' && req.address === '/v1/chat/completions') {
                    var r = req.json();
                    var sz = r.messages.length;
                    var is_fibjs = false;

                    for (var i = 0; i < sz; i++)
                        if (r.messages[i].content.toLowerCase().indexOf('fibjs') >= 0) {
                            is_fibjs = true;
                            break;
                        }

                    if (is_fibjs) {
                        req.setHeader('Authorization', `Bearer ${OPENAI_API_KEY}`);

                        var messages = [];

                        r.messages.forEach((message) => {
                            if (message.role !== 'system')
                                messages.push(message);
                        });
                        sz = messages.length;
                        if (sz > 5) {
                            messages = messages.slice(sz - 5, sz);
                            sz = 5;
                        }

                        var ask_messages = messages[sz - 1];
                        messages = messages.slice(0, sz - 1);

                        var ask_embedding = get_embedding(ask_messages.content);

                        var contents = dbconn.execute(`SELECT fibjs_docs.id, fibjs_docs.text, fibjs_docs.total_tokens, distance FROM fibjs_index, fibjs_docs WHERE vec_search(fibjs_index.vec, "${JSON.stringify(ask_embedding.data[0].embedding)}:50") AND fibjs_docs.rowid = fibjs_index.rowid ORDER BY distance`);
                        console.log('top distance:', contents[0].distance);

                        var content_tokens = 0;
                        for (var i = 0; i < contents.length; i++) {
                            if (content_tokens < 1000) {
                                // console.notice(`id: ${content.id} distance: ${content.distance}`);
                                // console.log('content:', content.text);

                                messages.push({
                                    role: 'system',
                                    content: contents[i].text
                                });
                                content_tokens += contents[i].total_tokens;
                            }
                            else
                                break;
                        }

                        messages.push({
                            role: 'system',
                            content: prompt
                        });
                        messages.push(ask_messages);

                        r.messages = messages;
                        console.log(r.messages);

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
