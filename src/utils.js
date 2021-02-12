const u = require('unist-builder')
const camelcase = require('camelcase')

function parseParameterSignature (statement) {
  let parameters

  if (statement.type === 'ClassDeclaration') {
    const ctor = statement.children.find(n => n.type === 'Constructor')
    parameters = ctor && ctor.children
  } else {
    parameters = statement.children
  }

  if (!parameters || parameters.length === 0) return ''

  return parameters.map(p => `${p.name}${p.isOptional ? '?' : ''}`).join(', ')
}

function parentSignatureName (statement) {
  return statement.isStatic ? statement.parent.name : camelcase(statement.parent.name)
}

function getId (statement) {
  if (['MethodDeclaration', 'PropertyDeclaration', 'GetAccessor', 'SetAccessor'].includes(statement.type)) {
    return `${parentSignatureName(statement)}.${statement.name}`
  }

  return statement.name
}

function parseSignature (statement) {
  if (statement.type === 'ClassDeclaration') {
    return `${camelcase(statement.name)} = new ${statement.name}(${parseParameterSignature(statement)})`
  }

  if (['FunctionDeclaration', 'FunctionType'].includes(statement.type)) {
    return `${statement.name}(${parseParameterSignature(statement)}) => ${statement.valueType}`
  }

  if (statement.type === 'Event') {
    const parameters = parseParameterSignature(statement)
    return `${parentSignatureName(statement)}.on('${statement.name}'${parameters.length > 0 ? ', ' + parameters : ''}) => ${statement.valueType}`
  }

  if (statement.type === 'VariableDeclaration') {
    return `${statement.name} = ${statement.valueType}`
  }

  if (statement.type === 'TypeLiteral') {
    return `${statement.name}: {}`
  }

  if (statement.type === 'MethodDeclaration') {
    return `${parentSignatureName(statement)}.${statement.name}(${parseParameterSignature(statement)}) => ${statement.valueType}`
  }

  if (['PropertyDeclaration', 'GetAccessor', 'SetAccessor'].includes(statement.type)) {
    return `${parentSignatureName(statement)}.${statement.name}: ${statement.valueType}${statement.isReadonly ? ' (R)' : ''}`
  }

  return statement.name
}

function detectLanguage (str) {
  return str.split('.').slice(-1).join('.')
}

const captionRegex = /<caption\s*.*>(\s*.*)<\/caption>/i
const langRegex = /<lang\s*.*>(\s*.*)<\/lang>/i

function parseExamples (mod, doc, heading = true) {
  if (!doc) return []

  return doc.tags.filter(t => t.tagName === 'example').map(t => {
    let text = t.text

    let lang = t.text.match(langRegex)
    if (lang) {
      text = text.replace(lang[0], '').trim()
      lang = lang[1]
    } else {
      lang = detectLanguage(mod.path)
    }

    const caption = t.text.match(captionRegex)
    if (caption) {
      return [
        heading ? u('heading', { depth: 4 }, [u('text', caption[1])]) : u('text', caption[1]),
        u('code', { lang }, text.replace(caption[0], '').trim())
      ]
    }

    return u('code', { lang }, text)
  }).flat()
}

module.exports = { parseExamples, parseSignature, getId }
