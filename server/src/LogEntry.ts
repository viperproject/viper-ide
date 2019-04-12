/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */

export enum LogType {
    Comment,
    Pop,
    Push,
    SetOption,
    DeclareDatatypes,
    DeclareConst,
    DeclareSort,
    DeclareFun,
    DefineConst,
    DefineDatatypes,
    DefineSort,
    DefineFun,
    Assert,
    CheckSat,
    GetInfo,
}

export class LogEntry {

    public type;
    public data;
    public typeName;

    constructor(type: LogType, data: string) {
        this.data = data.trim();
        this.type = type;
        this.typeName = type.toString;
    }
}