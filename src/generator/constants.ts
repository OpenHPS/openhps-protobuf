export const HEADER = `/**
 * OpenHPS Protocol Buffer 
 *  This file was automatically generated with @openhps/protobuf
 * 
 * (c) 2019-2024 Maxim Van de Wynckel & Vrije Universiteit Brussel
 **/\n
`;

export const COMMON =
    HEADER +
    `syntax = "proto3";` +
    // EnumValueOptions is declared in descriptor.proto. Extending it without importing
    // that file leaves protobufjs unable to resolve the extension, and loading the
    // generated schema fails with "unresolvable extensions".
    `\nimport "google/protobuf/descriptor.proto";\n` +
    `\nextend google.protobuf.EnumValueOptions {\n` +
    // Field numbers 1 and 2 belong to EnumValueOptions' own fields; reusing them made
    // protobufjs reject the schema with "duplicate id 1". Custom options must sit in
    // the 50000-99999 range protobuf reserves for third-party extensions.
    `\toptional string className = 50001;\n` +
    `\toptional string packageName = 50002;\n` +
    `}\n`;
// `\nextend google.protobuf.MessageOptions {\n` +
// `\toptional string className = 1001;\n` +
// `\toptional string packageName = 1002;\n` +
// `}\n`;
