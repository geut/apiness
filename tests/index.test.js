const path = require('path')
const vfile = require('vfile')
const apiness = require('../src')

test('basic', async () => {
  const file = apiness({
    entry: path.resolve('./tests/example/index.js'),
    file: vfile({
      path: 'api.md', contents: `
<!-- apiness-intro -->

## Usage

<!-- apiness-usage -->

## API

<!-- apiness-api -->
`
    })
  })

  expect(file.contents).toMatchSnapshot()
})
