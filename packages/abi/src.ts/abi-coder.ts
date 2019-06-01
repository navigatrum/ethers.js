"use strict";

// See: https://github.com/ethereum/wiki/wiki/Ethereum-Contract-ABI

import { arrayify, BytesLike } from "@ethersproject/bytes";
import * as errors from "@ethersproject/errors";
import { defineReadOnly } from "@ethersproject/properties";

import { Coder, Reader, Writer } from "./coders/abstract-coder";
import { AddressCoder } from "./coders/address";
import { ArrayCoder } from "./coders/array";
import { BooleanCoder } from "./coders/boolean";
import { BytesCoder } from "./coders/bytes";
import { FixedBytesCoder } from "./coders/fixed-bytes";
import { NullCoder } from "./coders/null";
import { NumberCoder } from "./coders/number";
import { StringCoder } from "./coders/string";
import { TupleCoder } from "./coders/tuple";

import { ParamType } from "./fragments";


const paramTypeBytes = new RegExp(/^bytes([0-9]*)$/);
const paramTypeNumber = new RegExp(/^(u?int)([0-9]*)$/);


export type CoerceFunc = (type: string, value: any) => any;

export class AbiCoder {
    readonly coerceFunc: CoerceFunc;

    constructor(coerceFunc?: CoerceFunc) {
        errors.checkNew(new.target, AbiCoder);
        defineReadOnly(this, "coerceFunc", coerceFunc || null);
    }

    _getCoder(param: ParamType): Coder {

        switch (param.baseType) {
            case "address":
                return new AddressCoder(param.name);
            case "bool":
                return new BooleanCoder(param.name);
            case "string":
                return new StringCoder(param.name);
            case "bytes":
                return new BytesCoder(param.name);
            case "array":
                return new ArrayCoder(this._getCoder(param.arrayChildren), param.arrayLength, param.name);
            case "tuple":
                return new TupleCoder((param.components || []).map((component) => {
                    return this._getCoder(component);
                }), param.name);
            case "":
                return new NullCoder(param.name);
        }

        // u?int[0-9]*
        let match = param.type.match(paramTypeNumber);
        if (match) {
            let size = parseInt(match[2] || "256");
            if (size === 0 || size > 256 || (size % 8) !== 0) {
                errors.throwError("invalid " + match[1] + " bit length", errors.INVALID_ARGUMENT, {
                    arg: "param",
                    value: param
                });
            }
            return new NumberCoder(size / 8, (match[1] === "int"), param.name);
        }

        // bytes[0-9]+
        match = param.type.match(paramTypeBytes);
        if (match) {
            let size = parseInt(match[1]);
            if (size === 0 || size > 32) {
                errors.throwError("invalid bytes length", errors.INVALID_ARGUMENT, {
                    arg: "param",
                    value: param
                });
            }
            return new FixedBytesCoder(size, param.name);
        }

        return errors.throwError("invalid type", errors.INVALID_ARGUMENT, {
            arg: "type",
            value: param.type
        });
    }

    _getWordSize(): number { return 32; }

    _getReader(data: Uint8Array): Reader {
        return new Reader(data, this._getWordSize(), this.coerceFunc);
    }

    _getWriter(): Writer {
        return new Writer(this._getWordSize());
    }

    encode(types: Array<string | ParamType>, values: Array<any>): string {
        if (types.length !== values.length) {
            errors.throwError("types/values length mismatch", errors.INVALID_ARGUMENT, {
                count: { types: types.length, values: values.length },
                value: { types: types, values: values }
            });
        }

        let coders = types.map((type) => this._getCoder(ParamType.from(type)));
        let coder = (new TupleCoder(coders, "_"));

        let writer = this._getWriter();
        coder.encode(writer, values);
        return writer.data;
    }

    decode(types: Array<string | ParamType>, data: BytesLike): any {
        let coders: Array<Coder> = types.map((type) => this._getCoder(ParamType.from(type)));
        let coder = new TupleCoder(coders, "_");
        return coder.decode(this._getReader(arrayify(data)));
    }
}

export const defaultAbiCoder: AbiCoder = new AbiCoder();
