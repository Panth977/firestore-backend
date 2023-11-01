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

    async create<T extends DbPaths<DbPathsMap>, D extends Record<string | number, unknown>>(
        ref: Ref.TDoc<T> | Ref.TDocArg<T>,
        context: null | Parser.TEventBy,
        data: D
    ) {
        const docRef = this.doc(ref);
        await this.apis.create(Ref.getDocRef(docRef), Parser.formJsonToFirestoreDoc('create', docRef, data, context));
        return [docRef, data] as const;
    }
    async update<T extends DbPaths<DbPathsMap>, D extends Record<string | number, unknown>>(
        ref: Ref.TDoc<T> | Ref.TDocArg<T>,
        context: null | Parser.TEventBy,
        data: D
    ) {
        const docRef = this.doc(ref);
        await this.apis.update(Ref.getDocRef(docRef), Parser.formJsonToFirestoreDoc('update', docRef, data, context));
        return [docRef, data] as const;
    }
    async delete<T extends DbPaths<DbPathsMap>, D extends Record<string | number, unknown> = Record<never, never>>(
        ref: Ref.TDoc<T> | Ref.TDocArg<T>,
        context: null | Parser.TEventBy,
        data?: D
    ) {
        data ??= {} as never;
        const docRef = this.doc(ref);
        await this.apis.update(Ref.getDocRef(docRef), Parser.formJsonToFirestoreDoc('delete', docRef, data, context));
        return [docRef, data] as const;
    }
    async hardDelete<T extends DbPaths<DbPathsMap>>(ref: Ref.TDoc<T> | Ref.TDocArg<T>) {
        const docRef = this.doc(ref);
        await this.apis.delete(Ref.getDocRef(docRef));
        return [docRef] as const;
    }

    async getDoc<T extends DbPaths<DbPathsMap>>(ref: Ref.TDoc<T> | Ref.TDocArg<T>) {
        const docRef = this.doc(ref);
        const snap = await this.apis.get(Ref.getDocRef(docRef));
        return Parser.fromSnapshotToJson(this.db, docRef, snap);
    }
    async getQuery<T extends DbPaths<DbPathsMap> | CollectionGroup<CollectionGroupMap>>(
        data: Ref.TQueryArg<T>,
        params: { limit?: number } & CursorParams & Ref.QueryParams = {}
    ) {
        this.validateCollRef(data.$);
        const ref = Ref.query(this.db, data, params ?? {});
        let query = Ref.getQueryRef(ref);
        query = addCursor(params, query);
        if (params.limit) query = query.limit(params.limit);
        const snaps = await this.apis.get(query);
        const $: TGetDbPath<T, DbPathsMap, CollectionGroupMap> = (this.collectionGroupsMap[ref.$] ?? ref.$) as never;
        return Object.assign(
            snaps.docs.map((x) => Parser.fromSnapshotToJson(this.db, $, x)),
            { cursor: createCursor(params, snaps.docs[snaps.docs.length - 1]) }
        );
    }
}

interface CursorParams {
    cursor?: string;
    orderBy?: [Parser.TDocFields, 'desc' | 'asc'];
}

function addCursor({ cursor, orderBy }: CursorParams, query: FirebaseFirestore.Query) {
    if (!orderBy) orderBy = ['$standard.created_at', 'desc'];
    query = query.orderBy(...orderBy);
    if (!cursor) return query;
    const { orderedBy, fieldValue } = JSON.parse(cursor);
    if (orderedBy !== `${orderBy[1]}: ${orderBy[0]}`) throw new Error('Cursor found has a different ordering then mentioned in query');
    if (fieldValue) return query.startAfter(Parser.decodeField(fieldValue));
    return query;
}

function createCursor({ cursor, orderBy }: CursorParams, lastDoc?: FirebaseFirestore.DocumentSnapshot) {
    if (!orderBy) orderBy = ['$standard.created_at', 'desc'];
    const orderedBy = `${orderBy[1]}: ${orderBy[0]}`;
    if (lastDoc) return JSON.stringify({ orderedBy: orderedBy, fieldValue: Parser.encodeField(lastDoc.get(orderBy[0])) });
    if (cursor) return cursor;
    return JSON.stringify({ orderedBy: orderedBy, fieldValue: null });
}
