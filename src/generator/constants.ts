export const HEADER = `/**
 * OpenHPS Protocol Buffer 
 *  This file was automatically generated with @openhps/protobuf
 * 
 * (c) 2019-2023 Maxim Van de Wynckel & Vrije Universiteit Brussel
 **/\n
`;

export const COMMON = 
    `syntax = "proto3";` + 
    `\n\nextend google.protobuf.EnumValueOptions {\n` +
    `\toptional string className = 1001;\n` +
    `\toptional string packageName = 1002;\n` +
    `}\n`;
    // `\nextend google.protobuf.MessageOptions {\n` +
    // `\toptional string className = 1001;\n` +
    // `\toptional string packageName = 1002;\n` +
    // `}\n`;