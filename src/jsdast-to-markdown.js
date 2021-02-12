const u = require('unist-builder')
const sort = require('array-sort')
const micromatch = require('micromatch')

const { parseSignature, parseExamples, getId } = require('./utils')

const patternToArray = pattern => typeof pattern === 'string' ? pattern.split(',') : pattern

const getModule = node => node.type === 'Module' ? node : getModule(node.parent)

class JSDastToMarkdown {
  constructor (tree, opts = {}) {
    const { include, exclude, order } = opts
    this._tree = tree
    this._modules = sort(this._tree.children, ['name'])
    this._include = patternToArray(include)
    this._exclude = patternToArray(exclude)
    this._order = patternToArray(order)
    this.intro = []
    this.usage = []
    this.api = []
    this._renderPackageDocumentation()
    this._renderAPI()
  }

  run () {
    return u('root', [
      ...this.intro,
      ...this.usage,
      ...this.api
    ])
  }

  _renderAPI () {
    const modules = this._modules

    let exportedDeclarations = []
    let exportedTypes = []
    let nonExported = []

    modules.forEach(module => {
      const { children } = module

      exportedDeclarations = [...exportedDeclarations, ...children.filter(n => n.isExported && !(n.type.includes('Type') || n.type.includes('Variable')))]
      exportedTypes = [...exportedTypes, ...children.filter(n => n.isExported && (n.type.includes('Type') || n.type.includes('Variable')))]
      nonExported = [...nonExported, ...children.filter(n => !n.isExported)]
    })

    let statements = [...exportedDeclarations, ...exportedTypes, ...nonExported]

    if (!this._order) {
      return statements.forEach(statement => this._renderStatement(statement))
    }

    const groupOrder = {}

    this._order.forEach(order => {
      if (!groupOrder[order]) {
        groupOrder[order] = []
      }

      const nextStatements = []
      groupOrder[order] = statements.filter(statement => {
        if (micromatch.isMatch(getId(statement), order)) {
          return true
        }
        nextStatements.push(statement)
        return false
      })
      statements = nextStatements
    })

    Object.keys(groupOrder).forEach(order => {
      groupOrder[order].forEach(statement => this._renderStatement(statement))
    })
    statements.forEach(statement => this._renderStatement(statement))
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

    if (['FunctionDeclaration', 'FunctionType', 'MethodDeclaration', 'Event'].includes(statement.type)) {
      this._renderParameters(statement.children)
      parseExamples(getModule(statement), statement.doc).forEach(ex => this.api.push(ex))
      return
    }

    if (statement.type === 'TypeLiteral') {
      this._renderPropertySignatures(statement)
      this._renderEvents(statement)
      return
    }

    if (statement.type === 'ClassDeclaration') {
      const ctor = statement.children.find(n => n.type === 'Constructor')
      if (ctor) {
        this._renderParameters(ctor.children)
        parseExamples(getModule(statement), statement.doc).forEach(ex => this.api.push(ex))
      }
      this._renderMethods(statement)
      this._renderPropertyDeclarations(statement)
      this._renderAccesors(statement)
      this._renderEvents(statement)
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
          u('inlineCode', `${param.name}${param.isOptional ? '?' : ''}: ${param.valueType}${defaultValue}`),
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

  _renderEvents (statement) {
    statement.children
      .filter(n => n.type === 'Event')
      .forEach(event => {
        this._renderStatement(event)
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
