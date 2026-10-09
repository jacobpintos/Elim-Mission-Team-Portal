# Hey Miriam, in the browser

sherpa-onnx's keyword spotter built for the web (WebAssembly), loaded by
`src/lib/wakeEngine.web.ts` the first time "Listen for Hey Miriam" is
switched on.

- sherpa-onnx v1.13.8 (Apache 2.0), built with `build-wasm-simd-kws.sh`
  and emscripten 4.0.23.
- The model packed into the `.data` file is
  sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01 (Apache 2.0), its
  int8 encoder, decoder and joiner under the names the build expects.
- `sherpa-onnx-kws.js` is sherpa-onnx's own JavaScript wrapper for it.

To rebuild for another version: put the model files in
`sherpa-onnx/wasm/kws/assets`, run `./build-wasm-simd-kws.sh`, and copy
`build-wasm-simd-kws/install/bin/wasm/sherpa-onnx-*` here.
