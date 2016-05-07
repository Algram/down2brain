var express = require('express');
var router = express.Router();
var scraper = require('../scraper');

/* GET home page. */
router.post('/', function(req, res) {
  res.render('index', { title: 'Down2Brain', success: 'Success. Download started.' });

  var url = req.body.url;
  scraper.start(url);

  res.redirect('back');
});

module.exports = router;
