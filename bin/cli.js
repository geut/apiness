#!/usr/bin/env node

const path = require('path')
const sade = require('sade')
const vfile = require('to-vfile')

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
  .option('--stdout', 'Print to stdout', false)
  .action((entry, opts) => {
    const stdout = opts.stdout || !process.stdout.isTTY

    const file = apiness({
      entry,
      file: vfile.readSync(path.resolve(opts.markdown)),
      include: opts.include,
      exclude: opts.exclude
    })

    if (stdout) {
      process.stdout.write(file.contents)
      return
    }

    vfile.writeSync(file)
  })
  .parse(process.argv)
