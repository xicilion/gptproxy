# gptproxy
use gitlab api key to proxy openai api.

This piece of code is an HTTPS reverse proxy implemented using fibjs, which listens on port 443 and communicates using encrypted SSL/TLS.

During the process of handling a request, the code reads the request sent by the client, parses the Authorization field in the request header, and retrieves the Token from it. Then, it uses this Token to make a request to the remote server (https://git.corp.com).

If the response code is not 200 (i.e., an error occurs), an exception is thrown. If the request succeeds, the code forwards the client’s request to a specified remote server address (https://api.openai.com/) and returns the response result to the client.

Finally, this example starts the HTTPS server and begins listening for requests at the end of the code.
