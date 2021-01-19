const u = require('unist-builder')
const parents = require('unist-util-parents')
const sort = require('array-sort')
const micromatch = require('micromatch')

const { parseSignature, parseExamples, getId } = require('./utils')

const patternToArray = pattern => typeof pattern === 'string' ? pattern.split(',') : pattern

class JSDastToMarkdown {
  constructor (tree, opts = {}) {
    const { sortModule = ['name'], sortStatement = ['name'], include, exclude } = opts
    this._tree = parents(tree)
    this._modules = sort(this._tree.children, sortModule)
    this._include = patternToArray(include)
    this._exclude = patternToArray(exclude)
    this.intro = []
    this.usage = []
    this.api = []
    this._renderPackageDocumentation()
    this._renderAPI(sortStatement)
  }

  run () {
    return u('root', [
      ...this.intro,
      ...this.usage,
      ...this.api
    ])
  }

  _renderAPI (sortStatement) {
    const modules = this._modules

    modules.forEach(module => {
      const { children } = module

      if (children.length !== 0) {
        // Module name heading (disabled for now)
        // this.api.push(u('heading', { depth: 3 }, [
        //   u('text', module.name)
        // ]))
      }

      const doc = module.doc

      if (doc && doc.description && !doc.tags.find(t => t.tagName === 'packageDocumentation')) {
        this.api.push(u('paragraph', [
          u('text', doc.description.trim())
        ]))
      }

      const exportedDeclarations = sort(
        children
          .filter(n => n.isExported && !(n.type.includes('Type') || n.type.includes('Variable'))),
        sortStatement)
      const exportedTypes = sort(
        children
          .filter(n => n.isExported && (n.type.includes('Type') || n.type.includes('Variable'))),
        sortStatement)
      const nonExported = sort(children.filter(n => !n.isExported), sortStatement)
      exportedDeclarations.forEach(statement => this._renderStatement(statement))
      exportedTypes.forEach(statement => this._renderStatement(statement))
      nonExported.forEach(statement => this._renderStatement(statement))
    })
  }

  _renderStatement (statement) {
    const { doc } = statement

    // filter
    if (this._include && !micromatch.isMatch(getId(statement), this._include)) return
    if (this._exclude && micromatch.isMatch(getId(statement), this._exclude)) return

    // filter protected/private statements
    if (doc && doc.tags.find(t => ['private', 'protected'].includes(t.tagName))) return

    // filter protected/private statements
    if (!statement.name || statement.name.startsWith('_')) return

    this.api.push(u('heading', { depth: 4 }, [
      u('inlineCode', parseSignature(statement))
    ]))

    if (doc && doc.description) {
      this.api.push(u('paragraph', [
        u('text', doc.description.trim())
      ]))
    }

    if (['FunctionDeclaration', 'FunctionType', 'MethodDeclaration'].includes(statement.type)) {
      this._renderParameters(statement.parameters)
      return
    }

    if (statement.type === 'TypeLiteral') {
      this._renderPropertySignatures(statement)
      return
    }

    if (statement.type === 'ClassDeclaration') {
      const ctor = statement.children.find(n => n.type === 'Constructor')
      if (ctor) {
        this._renderParameters(ctor.parameters)
      }
      this._renderMethods(statement)
      this._renderPropertyDeclarations(statement)
      this._renderAccesors(statement)
    }
  }

  _renderParameters (parameters, add = true) {
    if (parameters.length === 0) return

    const elem = u('list', {
      ordered: false,
      start: null,
      spread: false
    }, parameters.map(param => {
      const description = param.doc && param.doc.description
      const defaultValue = param.defaultValue ? ` = ${param.defaultValue}` : ''
      return u('listItem', {
        spread: false,
        checked: null
      }, [
        u('paragraph', [
          u('inlineCode', `${param.name}: ${param.valueType}${defaultValue}`),
          description ? u('text', ` ${description}`) : null
        ].filter(Boolean)),
        param.children && this._renderParameters(param.children, false)
      ].filter(Boolean))
    }))

    if (add) {
      this.api.push(elem)
    }

    return elem
  }

  _renderPropertySignatures (statement) {
    if (statement.children.length === 0) return

    this.api.push(u('list', {
      ordered: false,
      start: null,
      spread: false
    }, statement.children
      .filter(prop => !prop.name.startsWith('_'))
      .map(prop => {
        const { doc } = prop
        return u('listItem', {
          spread: false,
          checked: null
        }, [
          u('paragraph', [
            u('inlineCode', `${prop.name}: ${prop.valueType}`),
            doc && doc.description ? u('text', ` ${doc.description}`) : null
          ].filter(Boolean))
        ])
      })))
  }

  _renderMethods (statement) {
    statement.children
      .filter(n => n.type === 'MethodDeclaration')
      .forEach(method => {
        this._renderStatement(method)
      })
  }

  _renderPropertyDeclarations (statement) {
    statement.children
      .filter(n => n.type === 'PropertyDeclaration')
      .forEach(prop => {
        this._renderStatement(prop)
      })
  }

  _renderAccesors (statement) {
    const groups = statement.children
      .filter(n => ['GetAccessor', 'SetAccessor'].includes(n.type))
      .reduce((prev, curr) => {
        if (!prev[curr.name]) {
          prev[curr.name] = []
        }
        prev[curr.name].push(curr)
        return prev
      }, {})

    Object.values(groups).forEach(accessors => {
      if (accessors.length === 1 && accessors[0].type === 'GetAccessor') {
        accessors[0].isReadonly = true
      }

      return this._renderStatement(accessors[0])
    })
  }

  _renderPackageDocumentation () {
    for (const mod of this._modules) {
      const { doc } = mod
      if (doc) {
        const packageDocumentation = doc.tags.find(t => t.tagName === 'packageDocumentation')
        if (packageDocumentation) {
          const remarks = doc.tags.find(t => t.tagName === 'remarks')
          const examples = parseExamples(mod, doc)

          if (doc.description) {
            this.intro = [
              u('paragraph', [
                u('text', doc.description.trim()),
                remarks && u('break'),
                remarks && u('text', remarks.text.trim())
              ].filter(Boolean))
            ]
          }

          if (examples.length) {
            this.usage = examples
          }

          return
        }
      }
    }
  }
}

module.exports = JSDastToMarkdown
