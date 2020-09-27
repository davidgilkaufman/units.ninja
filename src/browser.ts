// Copyright 2020 Google Inc. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import Bindings from './bindings.js';

declare const Terminal: typeof import('xterm').Terminal;
declare const LocalEchoController: any;
declare const FitAddon: any;

(async () => {
  const module = WebAssembly.compileStreaming(fetch('./uutils.async.wasm'));

  let term = new Terminal();
  let fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  let localEcho = new LocalEchoController();
  term.loadAddon(localEcho);

  const stdout = {
    async write(data: Uint8Array) {
      let startIndex = 0;
      let newLine: number;
      while ((newLine = data.indexOf(10, startIndex)) !== -1) {
        await new Promise(resolve =>
          term.writeln(data.subarray(startIndex, newLine), resolve)
        );
        startIndex = newLine + 1;
      }
      await new Promise(resolve =>
        term.write(data.subarray(startIndex), resolve)
      );
    }
  };

  const cmdParser = /(?:'(.*?)'|"(.*?)"|(\S+))\s*/gy;

  let preOpen: Record<string, FileSystemDirectoryHandle> = {};

  term.open(document.body);

  fitAddon.fit();
  onresize = () => fitAddon.fit();

  while (true) {
    let line = await localEcho.read('$ ');
    let args = Array.from(
      line.matchAll(cmdParser),
      ([, s1, s2, s3]) => s1 ?? s2 ?? s3
    );
    try {
      if (args[0] === 'mount') {
        preOpen[args[1]] = await chooseFileSystemEntries({
          type: 'open-directory'
        });
        continue;
      }
      if (!args[0]) {
        continue;
      }
      let statusCode = await new Bindings({
        preOpen,
        stdout,
        stderr: stdout,
        args,
        env: {
          RUST_BACKTRACE: '1'
        }
      }).run(await module);
      if (statusCode !== 0) {
        term.writeln(`Exit code: ${statusCode}`);
      }
    } catch (err) {
      term.writeln(err.message);
    }
  }
})();
