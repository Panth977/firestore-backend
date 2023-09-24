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
    query<T extends DbPaths<DbPathsMap> | CollectionGroup<CollectionGroupMap>>(data: Ref.TQueryArg<T>, params: Ref.QueryParams): Ref.TQuery<T> {
        this.validateCollRef(data.$);
        return Ref.query(this.db, data, params);
    }
    async create(ref: Ref.TDoc<DbPaths<DbPathsMap>>, context: null | Parser.TEventBy, data: Record<string | number, unknown>) {
        this.validateDocRef(ref.$);
        await this.apis.create(Ref.getDocRef(ref), Parser.formJsonToFirestoreDoc('create', ref, data, context));
    }
    async update(ref: Ref.TDoc<DbPaths<DbPathsMap>>, context: null | Parser.TEventBy, data: Record<string | number, unknown>) {
        this.validateDocRef(ref.$);
        await this.apis.update(Ref.getDocRef(ref), Parser.formJsonToFirestoreDoc('update', ref, data, context));
    }
    async delete(ref: Ref.TDoc<DbPaths<DbPathsMap>>, context: null | Parser.TEventBy, data?: Record<string | number, unknown>) {
        this.validateDocRef(ref.$);
        await this.apis.update(Ref.getDocRef(ref), Parser.formJsonToFirestoreDoc('delete', ref, data ?? {}, context));
    }
    async hardDelete(ref: Ref.TDoc<DbPaths<DbPathsMap>>) {
        this.validateDocRef(ref.$);
        await this.apis.delete(Ref.getDocRef(ref));
    }
    async getDoc<T extends DbPaths<DbPathsMap>>(ref: Ref.TDoc<T>) {
        this.validateDocRef(ref.$);
        const snap = await this.apis.get(Ref.getDocRef(ref));
        return Parser.formSnapshotToJson(this.db, ref, snap);
    }
    async getDocs<T extends DbPaths<DbPathsMap> | CollectionGroup<CollectionGroupMap>>(
        ref: Ref.TQuery<T>,
        { limit, cursor }: { limit?: number; cursor?: unknown }
    ) {
        let query = Ref.getQueryRef(ref);
        if (cursor) query = query.startAfter(cursor);
        if (limit) query = query.limit(limit);
        const snaps = await this.apis.get(query);
        return snaps.docs.map((x) =>
            Parser.formSnapshotToJson(this.db, (this.collectionGroupsMap[ref.$] ?? ref.$) as TGetDbPath<T, DbPathsMap, CollectionGroupMap>, x)
        );
    }
    async getPaginatedDocs<T extends DbPaths<DbPathsMap> | CollectionGroup<CollectionGroupMap>>(
        ref: Ref.TQuery<T>,
        { pageRef, limit }: { pageRef?: { count: number; sent: number; cursor: unknown }; limit: number }
    ) {
        pageRef = Object.assign({}, pageRef ?? { count: 0, sent: 0, cursor: undefined });
        const isLastBatch = pageRef.count - pageRef.sent < limit * 1.7;
        const fetchDocs = this.getDocs(ref, {
            limit: isLastBatch ? Math.max(pageRef.count - pageRef.sent, limit) : limit,
            cursor: pageRef.cursor,
        });
        const [docs, count] = await Promise.all([
            fetchDocs,
            isLastBatch ? this.apis.get(Ref.getQueryRef(ref).count()).then((snap) => snap.data().count) : pageRef.count,
        ]);
        pageRef.sent += docs.length;
        pageRef.count = count;
        pageRef.cursor = docs[docs.length - 1].getVal(Ref.getQueryParams(ref).orderBy[0]);
        return Object.assign(docs, { pageRef });
    }
}
