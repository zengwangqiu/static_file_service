const http = require('http');
const path = require('path');
const StaticServer = require("./StaticServer");
const staticServer = new StaticServer({ defaultDir: path.join(__dirname, 'public') })
staticServer.init(
  http.createServer().listen(3002)
)
staticServer.init(
  http.createServer().listen(3003)
)
staticServer.init(
  http.createServer().listen(3004)
)