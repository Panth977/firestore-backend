import * as admin from 'firebase-admin';
import { BaseApis } from './apis';
import * as Ref from './ref';
import * as Parser from './parser';

type DbPaths<DbPathsMap> = keyof DbPathsMap extends string ? keyof DbPathsMap : never;
type CollectionGroup<CollectionGroupMap> = keyof CollectionGroupMap extends string ? keyof CollectionGroupMap : never;
type TGetDbPath<T extends string, DbPathsMap, CollectionGroupMap> = T extends keyof DbPathsMap
    ? T
    : T extends keyof CollectionGroupMap
    ? CollectionGroupMap[T]
    : never;

export default class DB<DbPathsMap extends Record<string, unknown>, CollectionGroupMap extends Record<string, string>> {
    apis: BaseApis;
    db: admin.firestore.Firestore;
    dbPathsMap: DbPathsMap;
    collectionGroupsMap: CollectionGroupMap;
    Val = admin.firestore.FieldValue;
    autoDocID = Ref.autoDocID;

    constructor(apis: BaseApis, db: admin.firestore.Firestore, dbPathsMap: DbPathsMap, collectionGroupsMap: CollectionGroupMap) {
        this.apis = apis;
        this.db = db;
        this.dbPathsMap = dbPathsMap;
        this.collectionGroupsMap = collectionGroupsMap;
    }
    private validateDocRef($: string) {
        if ($ in this.dbPathsMap) return;
        new Error('unknown doc path type found!');
    }
    private validateCollRef($: string) {
        if ($ in this.dbPathsMap) return;
        if ($ in this.collectionGroupsMap) return;
        new Error('unknown collection path type found!');
    }
    doc<T extends DbPaths<DbPathsMap>>(data: Ref.TDocArg<T>): Ref.TDoc<T> {
        this.validateDocRef(data.$);
        return Ref.doc(this.db, data);
    }
    query<T extends DbPaths<DbPathsMap> | CollectionGroup<CollectionGroupMap>>(data: Ref.TQueryArg<T>, params?: Ref.QueryParams): Ref.TQuery<T> {
        this.validateCollRef(data.$);
        return Ref.query(this.db, data, params ?? {});
    }
    async create<T extends DbPaths<DbPathsMap>>(ref: Ref.TDoc<T>, context: null | Parser.TEventBy, data: Record<string | number, unknown>) {
        this.validateDocRef(ref.$);
        await this.apis.create(Ref.getDocRef(ref), Parser.formJsonToFirestoreDoc('create', ref, data, context));
    }
    async update<T extends DbPaths<DbPathsMap>>(ref: Ref.TDoc<T>, context: null | Parser.TEventBy, data: Record<string | number, unknown>) {
        this.validateDocRef(ref.$);
        await this.apis.update(Ref.getDocRef(ref), Parser.formJsonToFirestoreDoc('update', ref, data, context));
    }
    async delete<T extends DbPaths<DbPathsMap>>(ref: Ref.TDoc<T>, context: null | Parser.TEventBy, data?: Record<string | number, unknown>) {
        this.validateDocRef(ref.$);
        await this.apis.update(Ref.getDocRef(ref), Parser.formJsonToFirestoreDoc('delete', ref, data ?? {}, context));
    }
    async hardDelete<T extends DbPaths<DbPathsMap>>(ref: Ref.TDoc<T>) {
        this.validateDocRef(ref.$);
        await this.apis.delete(Ref.getDocRef(ref));
    }

    get<T extends DbPaths<DbPathsMap>>(ref: Ref.TDoc<T>): Promise<Parser.TDbDoc<T>>;
    get<T extends DbPaths<DbPathsMap> | CollectionGroup<CollectionGroupMap>>(
        ref: Ref.TQuery<T>,
        { limit, cursor, orderBy }: { limit?: number; cursor?: unknown; orderBy?: [string, 'desc' | 'asc'] }
    ): Promise<Parser.TDbDoc<TGetDbPath<T, DbPathsMap, CollectionGroupMap>>[] & { cursor: unknown }>;
    async get(...arg: never) {
        if (Ref.getDocRef(arg[0])) {
            const [ref] = arg as [Ref.TDoc<string>];
            this.validateDocRef(ref.$);
            const snap = await this.apis.get(Ref.getDocRef(ref));
            return Parser.formSnapshotToJson(this.db, ref, snap) as never;
        } else {
            (arg as unknown[]).push({});
            const [ref, params] = arg as [Ref.TQuery<string>, { limit?: number; cursor?: unknown; orderBy?: [string, 'desc' | 'asc'] }];
            let query = Ref.getQueryRef(ref);
            const snaps = await this.apis.get(query);
            if (!params.orderBy) params.orderBy = ['$standard.created_at', 'desc'];
            query = query.orderBy(...params.orderBy);
            if (params.cursor) query = query.startAfter(params.cursor);
            if (params.limit) query = query.limit(params.limit);
            return Object.assign(
                snaps.docs.map((x) => Parser.formSnapshotToJson(this.db, this.collectionGroupsMap[ref.$] ?? ref.$, x)),
                { cursor: snaps.docs[snaps.docs.length - 1].get(params.orderBy[0]) }
            ) as never;
        }
    }
}
