#!/usr/bin/env node

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot =
  process.env.TREE_ASSET_SOURCE ??
  '/Users/grey/Downloads/Textured Stylized Trees - May 2020'
const outputRoot = path.join(projectRoot, 'public', 'models', 'trees', 'quaternius')

const models = [
  ['Tree_1.obj', 'tree-01.glb'],
  ['Tree_4.obj', 'tree-04.glb'],
  ['Pine_1.obj', 'pine-01.glb'],
  ['Birch_1.obj', 'birch-01.glb'],
  ['DeadTree_1.obj', 'dead-tree-01.glb'],
]

const textures = [
  'Tree_Bark.jpg',
  'Tree_Leaves.png',
  'Pine_Leaves.png',
  'Birch_Bark.png',
  'Birch_Leaves_Green.png',
]

/**
 * GLTFExporter uses the browser FileReader API to finish binary exports.
 * Node already provides Blob; this tiny adapter supplies the two read modes
 * the exporter needs without adding another build dependency.
 */
class NodeFileReader {
  result = null
  error = null
  onloadend = null
  onerror = null

  async readAsArrayBuffer(blob) {
    await this.#read(async () => blob.arrayBuffer())
  }

  async readAsDataURL(blob) {
    await this.#read(async () => {
      const bytes = Buffer.from(await blob.arrayBuffer())
      return `data:${blob.type || 'application/octet-stream'};base64,${bytes.toString('base64')}`
    })
  }

  async #read(load) {
    try {
      this.result = await load()
      this.onloadend?.({ target: this })
    } catch (error) {
      this.error = error
      this.onerror?.({ target: this })
      this.onloadend?.({ target: this })
    }
  }
}

globalThis.FileReader ??= NodeFileReader

async function exportModel(sourceName, outputName) {
  const sourcePath = path.join(sourceRoot, 'OBJ', sourceName)
  const source = await readFile(sourcePath, 'utf8')
  const scene = new OBJLoader().parse(source)
  scene.name = path.parse(outputName).name

  scene.traverse((object) => {
    if (!object.isMesh) return
    const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material]
    object.material = sourceMaterials.map((material) => {
      const converted = new THREE.MeshStandardMaterial({
        color: material.color,
        roughness: 0.92,
        metalness: 0,
      })
      converted.name = material.name
      return converted
    })
    object.castShadow = false
    object.receiveShadow = true
    object.geometry.computeBoundingBox()
    object.geometry.computeBoundingSphere()
  })

  const binary = await new GLTFExporter().parseAsync(scene, {
    binary: true,
    onlyVisible: true,
    trs: false,
    animations: [],
    includeCustomExtensions: false,
  })

  if (!(binary instanceof ArrayBuffer)) {
    throw new TypeError(`Expected binary GLB output for ${sourceName}`)
  }

  const outputPath = path.join(outputRoot, outputName)
  await writeFile(outputPath, Buffer.from(binary))
  return outputPath
}

await mkdir(path.join(outputRoot, 'textures'), { recursive: true })

for (const [sourceName, outputName] of models) {
  const outputPath = await exportModel(sourceName, outputName)
  console.log(`Imported ${sourceName} -> ${path.relative(projectRoot, outputPath)}`)
}

for (const texture of textures) {
  await copyFile(
    path.join(sourceRoot, 'Textures', texture),
    path.join(outputRoot, 'textures', texture),
  )
}

await copyFile(path.join(sourceRoot, 'License.txt'), path.join(outputRoot, 'LICENSE.txt'))

console.log(`Copied ${textures.length} textures and CC0 license`)
