const unified = require('unified')
const { TypeDefinitionParser } = require('@geut/jsdast')
const remarkParse = require('remark-parse')
const remarkStringify = require('remark-stringify')
const assert = require('assert')

const JSDastToMarkdown = require('./jsdast-to-markdown')

function getLimits (tree, type) {
  const start = tree.children.findIndex(n => n.type === 'html' && n.value.includes('apiness/' + type))
  if (start === -1) return null
  let end = tree.children.slice(start).findIndex(n => n.type === 'heading' && n.depth === 2)
  end = end !== -1 ? start + end : tree.children.length
  return { start: start + 1, end }
}

function renderSection (tree, section, type) {
  // if (section.length === 0) return
  const limits = getLimits(tree, type)
  if (!limits) return

  const partOne = tree.children.slice(0, limits.start)
  const partTwo = tree.children.slice(limits.end)

  tree.children = [...partOne, ...section, ...partTwo]
}

function transform (opts = {}) {
  const { entry, include, exclude, order, parserOptions } = opts

  const typeDefParser = new TypeDefinitionParser(parserOptions)

  return (tree) => {
    const { intro, usage, api } = new JSDastToMarkdown(typeDefParser.run({ path: entry }), { include, exclude, order })
    renderSection(tree, intro, 'intro')
    renderSection(tree, usage, 'usage')
    renderSection(tree, api, 'api')
    return tree
  }
}

function apiness (opts = {}) {
  const { entry, file, include, exclude, order, parserOptions } = opts

  assert(entry)
  assert(file)

  const processor = unified()
    .use(remarkParse)
    .use(transform, { entry, include, exclude, order, parserOptions })
    .use(remarkStringify)

  processor.process(file)

  return file
}

module.exports = apiness
