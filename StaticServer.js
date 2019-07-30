const fs = require('fs');
const path = require('path');
const url = require('url');
const zlib = require('zlib');
class StaticServer {
  constructor(config = {}) {
    config = Object.assign({
      defaultDir: '/',
      defaultFile: 'index.html',
      fileMatch: /^(gif|png|jpg|js|css)$/ig,
      zipMatch: /css|js|html/ig,
      maxAge: 60 * 60
    }, config)
    this.defaultDir = config.defaultDir;
    this.defaultFile = config.defaultFile;
    this.fileMatch = config.fileMatch;
    this.maxAge = config.maxAge;
    this.zipMatch = config.zipMatch;
  }
  //初始化
  init(server) {
    const self = this;
    server.on('listening', function () {
      const port = server.address().port;
      console.log('Server running at ' + port);
    })
    server.on('request', function (req, res) {
      // 解析请求的URL
      const oURL = url.parse(req.url);
      const pathName = path.join(self.defaultDir, oURL.pathname.slice(1));
      self.route(pathName, req, res);
    });
  }

  route(pathName, req, res) {/* 路由到指定的文件并响应输出 */
    const self = this;
    fs.stat(pathName, function (err, stats) {
      if (err) {
        res.writeHead(404, "Not Found", { 'Content-Type': 'text/plain' });
        res.write("This request URL " + pathName + " was not found on this server.");
        res.end();
      } else {
        if (stats.isDirectory()) {
          const oURL = url.parse(req.url);
          oURL.pathname = path.join(oURL.pathname, '/', self.defaultFile);
          console.log(url.format(oURL));
          res.writeHead(302, {
            'Location': url.format(oURL)
          })
          res.end()
          // console.log(url.format(oURL))
          // console.log(req)
          // pathName = path.join(pathName, '/', self.defaultFile);
          // self.route(pathName, req, res);
        } else {
          const method = req.method
          let type = path.extname(pathName), params = '';

          type = type ? type.slice(1) : 'unknown';

          // 如果是get请求，且url结尾为'/'，那么就返回 home 页
          if (method == 'GET') {
            pathName.slice(-1) === '/' && (pathName = path.join(pathName, '/', self.defaultFile));
            params = url.parse(req.url, true).query;
            self.responseFile(pathName, req, res, type, params, stats);
          } else if (method == 'POST') {
            var _postData = "", _postMap = "";
            req.on('data', function (chunk) {
              _postData += chunk;
            }).on("end", function () {
              params = require('querystring').parse(_postData);
              self.responseFile(pathName, req, res, type, params, stats);
            });
          } else {
            self.responseFile(pathName, req, res, ext, params, stats);
          }
        }
      }
    });
  }

  responseFile(pathName, req, res, type, params, stat) { /* 读取文件流并输出 */
    const self = this;
    let raw;


    // 告知服务器类型和版本
    res.setHeader("Server", "Node/V8");
    // 允许断点续传
    res.setHeader('Accept-Ranges', 'bytes');
    // 允许跨域调用
    res.setHeader("Access-Control-Allow-Origin", "*");
    // 添加文件MIME类型
    res.setHeader("Content-Type", self._getMIME(type));

    // 添加过期时间
    if (type.match(self.fileMatch)) {
      var expires = new Date();
      expires.setTime(expires.getTime() + self.maxAge * 1000);
      res.setHeader('Expires', expires.toUTCString());
      res.setHeader('Cache-Control', 'max-age=' + self.maxAge);
    }

    // 添加Last-Modified头
    var lastModified = stat.mtime.toUTCString();
    res.setHeader('Last-Modified', lastModified);

    // 检测请求头是否携带 If-Modified-Since 信息，如果请求的文件的If-Modified-Since时间与最后修改时间相同，则返回304
    var ifModifiedSince = "if-modified-since";
    if (req.headers[ifModifiedSince] && lastModified == req.headers[ifModifiedSince]) {
      // res.statusCode = 304
      res.writeHead(304, 'Not Modified');
      res.end();
      return;
    }
    var compressHandle = function (raw, statusCode, msg) {
      var stream = raw;
      var acceptEncoding = req.headers['accept-encoding'] || "";
      var zipMatch = type.match(self.zipMatch);
      if (zipMatch && acceptEncoding.match(/\bgzip\b/)) {
        res.setHeader("Content-Encoding", "gzip");
        stream = raw.pipe(zlib.createGzip());
      } else if (zipMatch && acceptEncoding.match(/\bdeflate\b/)) {
        res.setHeader("Content-Encoding", "deflate");
        stream = raw.pipe(zlib.createDeflate());
      }

      res.writeHead(statusCode, msg);

      stream.pipe(res);
    }
    if (req.headers['range']) {
      var range = self._getRange(req.headers['range'], stat.size);

      if (range) {
        res.setHeader('Content-Range', 'bytes ' + range.start + '-' + range.end + '/' + stat.size);
        res.setHeader('Content-Length', range.end - range.start + 1);
        raw = fs.createReadStream(pathName, { "start": range.start, "end": range.end });
        compressHandle(raw, 206, 'Partial Content');
      } else {
        res.removeHeader('Content-Length');
        res.writeHeader(416, 'Request Range Not Satisfiable');
        res.end();
      }
    } else {
      raw = fs.createReadStream(pathName);

      if (type == 'json' && params.delay) {
        setTimeout(function () {
          compressHandle(raw, 200, 'OK');
        }, params.delay);
      } else {
        compressHandle(raw, 200, 'OK');
      }
    }
  }

  _getMIME(type) {/* 获取文件的MIME类型 */
    var types = {
      "css": "text/css",
      "gif": "image/gif",
      "html": "text/html",
      "ico": "image/x-icon",
      "jpeg": "image/jpeg",
      "jpg": "image/jpeg",
      "js": "text/javascript",
      "json": "application/json",
      "pdf": "application/pdf",
      "png": "image/png",
      "svg": "image/svg+xml",
      "swf": "application/x-shockwave-flash",
      "tiff": "image/tiff",
      "txt": "text/plain",
      "wav": "audio/x-wav",
      "wma": "audio/x-ms-wma",
      "wmv": "video/x-ms-wmv",
      "xml": "text/xml"
    };

    return types[type] || 'application/octet-stream';
  }

  _getRange(str, size) {
    if (str.indexOf(",") != -1) {
      return;
    }
    var range = str.split("-"),
      start = parseInt(range[0], 10),
      end = parseInt(range[1], 10);

    // Case: -100 返回最后的end个字节
    if (isNaN(start)) {
      start = size - end;
      end = size - 1;
      // Case: 100- 返回从start往后到end之间的字节
    } else if (isNaN(end)) {
      end = size - 1;
    }

    // Invalid
    if (isNaN(start) || isNaN(end) || start > end || end > size) {
      return;
    }
    return { start: start, end: end };
  }
}
module.exports = StaticServer