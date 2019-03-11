// init project
const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const unzip = require('unzipper');
const parser = require('xml2json');
const moveFile = require('move-file');
const emptyFolder = require('empty-folder');
const _ = require('underscore');
const PromiseFtp = require('promise-ftp');
const ftp = new PromiseFtp();

// Config
const ftpServer = "mediafeedarchive.aec.gov.au";
const directory = "/20499/Detailed/Verbose/";

const getResults = async () => {
  // Connect to FTP server and log server message
  const serverMessage = await ftp.connect({host: ftpServer});
  console.log(serverMessage);
  
  // Get directory listing
  const list = await ftp.list(directory);
  
  const latestZip = list[list.length -1];
  const fileName = latestZip.name;
  const zipStream = await ftp.get(directory + fileName)
  
  // Write zip to disk
  await getStream(zipStream, "data.zip");
  ftp.end(); // Close FTP connection
  
  // Unzip and copy xml file to results.xml
  fs.createReadStream('data.zip')
    .pipe(unzip.Extract({ path: 'extracted' }))
    .on('close', () => {
      console.log("Zip file extracted...");
    
      const filename = getMostRecentFileName('./extracted/xml/');
      console.log(filename);
    
      fs.copyFile('./extracted/xml/' + filename, './public/results.xml', (err) => {
        if (err) throw err;
        console.log('source was copied to destination');

        // Convert XML to JSON and write JSON file
        fs.readFile( './public/results.xml', function(err, data) {
          var jsonObj = parser.toJson(data);
          fs.writeFileSync("./public/results.json", jsonObj)
          console.log("JSON file written...");

          emptyFolder('./extracted', true, (output) => {
            if (output.error) console.error(output.error);
            console.log("Files removed: " + output.removed.length);
            console.log("Files not removed: " + output.failed.length);
          });
        });
      });
    });
}

/*
 * Express stuff
 *
 */

// http://expressjs.com/en/starter/static-files.html
app.use(express.static('public'));

// http://expressjs.com/en/starter/basic-routing.html
app.get('/', function(request, response) {
  response.sendFile(__dirname + '/views/index.html');
});

// Secret update trigger (to prevent abuse)
app.all("/" + process.env.UPDATE_ENDPOINT, function (request, response) {
  console.log("Update triggered...");
  
  getResults();
  
  response.sendStatus(200);
}); 

// listen for requests :)
const listener = app.listen(process.env.PORT, function() {
  console.log('Your app is listening on port ' + listener.address().port);
});

// Helper functions

// Writes a stream to filesystem
function getStream(stream, fileName) {
    return new Promise(function (resolve, reject) {
      stream.once('close', resolve);
      stream.once('error', reject);
      stream.pipe(fs.createWriteStream(fileName));
    });
  }

// Return only base file name without dir
function getMostRecentFileName(dir) {
    var files = fs.readdirSync(dir);

    // use underscore for max()
    return _.max(files, function (f) {
        var fullpath = path.join(dir, f);

        // ctime = creation time is used
        // replace with mtime for modification time
        return fs.statSync(fullpath).ctime;
    });
}