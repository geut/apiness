#!/usr/bin/env node

const path = require('path')
const sade = require('sade')
const vfile = require('to-vfile')
const { promises: fs } = require('fs')

const packageJSON = require('../package.json')
const apiness = require('../src')

sade('apiness <entry>', true)
  .version(packageJSON.version)
  .describe('Generate and insert API into a markdown file')
  .example('./src/index.js')
  .example('./src/**.js -m API.md')
  .option('-m, --markdown', 'Define the markdown filepath', 'README.md')
  .option('--include', 'Include statements by glob matching')
  .option('--exclude', 'Exclude statements by glob matching')
  .option('--order', 'Order statements by glob matching')
  .option('--stdout', 'Print to stdout', false)
  .action(async (entry, opts) => {
    const config = await fs.readFile(path.join(process.cwd(), 'package.json'))
      .then(file => JSON.parse(file))
      .then(config => config.apiness || {})
      .catch(() => ({}))

    const stdout = opts.stdout || !process.stdout.isTTY

    const file = apiness({
      entry,
      file: vfile.readSync(path.resolve(opts.markdown || config.markdown)),
      include: opts.include || config.include,
      exclude: opts.exclude || config.exclude,
      order: opts.order || config.order
    })

    if (stdout) {
      process.stdout.write(file.contents)
      return
    }

    vfile.writeSync(file)
  })
  .parse(process.argv)
