# gptproxy
use gitlab api key to proxy openai api.

This is a fibjs server code that serves as a development assistant. It listens on SSL port 443 and can answer questions related to fibjs development based on the information stored in its database.

The code starts with importing the required modules, including http, ssl, io, db, path, crypto, and util. It then sets the OpenAI API key and entry point, as well as the GitLab API entry point.

A new http client object is created, which will be used to make HTTP requests to the GitLab API. A cache object is also created using the LruCache class from the util module to store tokens retrieved from the GitLab API. The cache has a capacity of 100 items and an expiration time of 60,000 milliseconds (1 minute).

The get_embedding function is defined, which takes a text string as input, sends a POST request to the OpenAI API to get an embedding of the text, and returns the embedding as a JSON object. If the response status code is greater than 300, an error is thrown.

A new SQLite database connection is established, and two constant strings are defined: prompt and modules. The prompt string contains instructions for the user on how to ask questions, and the modules string lists the built-in modules of fibjs.

A new SSL server object is created using the Server class from the ssl module, which listens on port 443 and uses the cert.pem and key.pem files located in the same directory as the server code for SSL authentication. The server accepts incoming connections, sets a timeout of 90,000 milliseconds (1.5 minutes) on the connection, and creates a new BufferedStream object to handle the connection.

The code then enters a loop that reads incoming HTTP requests from the BufferedStream object. The loop checks if the request has a Bearer token in the Authorization header, and if it does, it checks if the token is already in the cache. If the token is not in the cache, the code sends an HTTP GET request to the GitLab API to verify the token and adds the token to the cache. If the response status code is greater than 300, an error is thrown. The loop then sets the Authorization header to use the OpenAI API key.

If a connection to the OpenAI API has not yet been established, the code creates a new SSL connection to the OpenAI API entry point using the connect method of the ssl module. The code then copies data between the BufferedStream object and the SSL connection until the connection is closed.

If the HTTP request address is "/v1/chat/completions", the code reads the request body as a JSON object and checks if the last message or the first message in the "messages" array contains the string "fibjs". If it does, the code calls the get_embedding function with the last message in the "messages" array, retrieves the top documents from the database that match the embedding using a SQL query, and constructs a response message to send back to the client.

The response message contains a system message with the prompt string, a system message with the modules string, and a system message for each matching document, up to a maximum of 2000 tokens. The response message is then sent back to the client.

The loop then sets the Host header to use the OpenAI API entry point and sends the HTTP request to the SSL connection to the OpenAI API. The loop continues until the connection is closed.

Finally, the code closes the incoming SSL connection and the SSL connection to the OpenAI API if they are still open.
