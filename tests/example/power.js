class Power {
  /**
   * @constructor
   * @param {Object} opts
   * @param {string} [opts.name='fire']
   */
  constructor (opts = {}) {
    this._name = opts.name
  }

  /**
   * @prop {string}
   */
  get name () {
    return this._name
  }
}

module.exports = { Power }
