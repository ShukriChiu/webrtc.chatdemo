
/*
 * GET rtc page.
 */

exports.open = function(req, res){
  res.render('rtc', { title: 'Express' });
};