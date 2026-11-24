'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function artifactApi() {
  const window = {
    U: {
      artifactKind: (lang, _code, name) => ({
        ext: lang === 'python' ? 'py' : lang === 'md' ? 'md' : lang,
        mime: lang === 'md' ? 'text/markdown' : 'text/plain',
        label: lang.toUpperCase(),
        name
      })
    }
  };
  vm.runInNewContext(fs.readFileSync('src/renderer/js/artifacts.js', 'utf8'), { window });
  return window.Artifact;
}

test('stores plain assistant replies as named Markdown artifacts', () => {
  const artifact = artifactApi().build('# Summary\n\nA useful answer.', { name: 'Research chat' });
  assert.equal(artifact.mode, 'markdown');
  assert.equal(artifact.name, 'Research chat.md');
  assert.equal(artifact.ext, 'md');
  assert.equal(artifact.code, '# Summary\n\nA useful answer.');
});

test('keeps fenced code extraction and returns no artifact for empty replies', () => {
  const api = artifactApi();
  const artifact = api.build('Here is code:\n```js\nconsole.log("hi");\n```', { name: 'Code chat' });
  assert.equal(artifact.mode, 'plain');
  assert.equal(artifact.code, 'console.log("hi");');
  assert.equal(api.build('  \n ', { name: 'Empty chat' }), null);
});
