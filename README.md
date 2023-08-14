<h1 align="center">
  <img alt="OpenHPS" src="https://openhps.org/images/logo_text-512.png" width="40%" /><br />
  @openhps/protobuf
</h1>
<p align="center">
    <a href="https://github.com/OpenHPS/openhps-protobuf/actions/workflows/main.yml" target="_blank">
        <img alt="Build Status" src="https://github.com/OpenHPS/openhps-protobuf/actions/workflows/main.yml/badge.svg">
    </a>
    <a href="https://codecov.io/gh/OpenHPS/openhps-protobuf">
        <img src="https://codecov.io/gh/OpenHPS/openhps-protobuf/branch/master/graph/badge.svg?token=U896HUBDCZ"/>
    </a>
    <a href="https://codeclimate.com/github/OpenHPS/openhps-protobuf/" target="_blank">
        <img alt="Maintainability" src="https://img.shields.io/codeclimate/maintainability/OpenHPS/openhps-protobuf">
    </a>
    <a href="https://badge.fury.io/js/@openhps%2Fprotobuf">
        <img src="https://badge.fury.io/js/@openhps%2Fprotobuf.svg" alt="npm version" height="18">
    </a>
</p>

<h3 align="center">
    <a href="https://github.com/OpenHPS/openhps-core">@openhps/core</a> &mdash; <a href="https://openhps.org/docs/protobuf">API</a>
</h3>

<br />

## Features

- Automatic protobuffer message generator
- Serialization and deserialization of all serializable OpenHPS classes

## Usage

### CLI Generator
This module can generate the protocol files (*.proto) automatically. 

1. Install the module using `npm install @openhps/protobuf@latest`
2. Open the root directory of your project containing your `package.json` file
3. Execute the CLI command using `openhps-protobuf`

#### Parameters

`-d <directory>`        Output directory

### Serialization and Deserialization
```typescript
import { ProtobufSerializer } from '@openhps/protobuf';

// Initialize the protocol buffer serializer with the protocol files
ProtobufSerializer.initialize("");
```

## Getting Started
If you have [npm installed](https://www.npmjs.com/get-npm), start using @openhps/protobuf with the following command.
```bash
npm install @openhps/protobuf --save
```

## Contributors
The framework is open source and is mainly developed by PhD Student Maxim Van de Wynckel as part of his research towards *Hybrid Positioning and Implicit Human-Computer Interaction* under the supervision of Prof. Dr. Beat Signer.

## Contributing
Use of OpenHPS, contributions and feedback is highly appreciated. Please read our [contributing guidelines](CONTRIBUTING.md) for more information.

## License
Copyright (C) 2019-2023 Maxim Van de Wynckel & Vrije Universiteit Brussel

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.