
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