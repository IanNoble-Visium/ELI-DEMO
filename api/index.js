module.exports = (req, res) => {
  return require('../src/server').app(req, res);
};

