type TParams<T extends string> = T extends `${string}/{${infer A}}${infer B}` ? [A, ...TParams<B>] : [];
type TPop<T extends string[]> = T extends [...infer A, string] ? A : T;
type Params<T extends string, popLast extends boolean> = {
    [k in popLast extends true ? TPop<TParams<T>>[number] : TParams<T>[number]]: string;
};

function parseDataToPath(data: TDocArg<string> | TQueryArg<string>): { path: string; removedTrailing: boolean } {
    if (!data.$.includes('{')) return { path: data.$, removedTrailing: false };
    let path: string = data.$;
    for (const param in data) path = path.replace(`{${param}}`, (data as Record<string, string>)[param]);
    if ((path + '{').indexOf('{') < path.lastIndexOf('/')) throw new Error('incomplete arguments');
    if (path.includes('{')) {
        return { path: path.substring(0, path.lastIndexOf('/')), removedTrailing: true };
    }
    return { path, removedTrailing: false };
}

/* ****** DOC ****** */
const docRef = Symbol();
type TDocRef<T extends string> = {
    $: T;
    [docRef]: FirebaseFirestore.DocumentReference;
};
export type TDocArg<T extends string> = { $: T } & Params<T, false>;
export type TDoc<T extends string> = TDocRef<T> & Params<T, false>;
export const autoDocID = '{undefined}' as never;

export function doc<T extends string>(db: FirebaseFirestore.Firestore, data: TDocArg<T>, ref?: FirebaseFirestore.DocumentReference): TDoc<T> {
    if (ref) return Object.assign(data, { [docRef]: ref });
    const path = parseDataToPath(data);
    if (path.removedTrailing) {
        const ref = db.collection(path.path).doc();
        return Object.assign(data, {
            [docRef]: ref,
            [data.$.substring(data.$.lastIndexOf('/') + 2, data.$.length - 1)]: ref.id,
        });
    }
    return Object.assign(data, {
        [docRef]: db.doc(path.path),
    });
}
export function getDocRef(doc: TDoc<string>) {
    return doc[docRef];
}

/* ****** QUERY ****** */
const queryRef = Symbol();
const queryParams = Symbol();
type TQueryRef<T extends string> = {
    $: T;
    [queryRef]: FirebaseFirestore.Query;
    [queryParams]: QueryParams;
};
export type QueryParams = {
    filters?: {
        [fieldPath: string]: ['<' | '<=' | '==' | '!=' | '>=' | '>' | 'array-contains' | 'in' | 'not-in' | 'array-contains-any', unknown];
    };
    allowDeleted?: boolean;
};
export type TQueryArg<T extends string> = { $: T } & Params<T, true>;
export type TQuery<T extends string> = TQueryRef<T> & Params<T, true>;

export function query<T extends string>(db: FirebaseFirestore.Firestore, data: TQueryArg<T>, params: QueryParams): TQuery<T> {
    let query;
    const path = parseDataToPath(data);
    if (path.removedTrailing) {
        query = db.collection(path.path);
    } else {
        query = db.collectionGroup(path.path);
    }
    if (!params.allowDeleted) {
        if (!params.filters) params.filters = {};
        params.filters['$on_delete'] = ['==', null];
    }
    if (params.filters) for (const field in params.filters) query = query.where(field, ...params.filters[field]);
    return Object.assign(data, { [queryRef]: query, [queryParams]: params });
}
export function getQueryRef(query: TQuery<string>) {
    return query[queryRef];
}
export function getQueryParams(query: TQuery<string>) {
    return query[queryParams];
}
