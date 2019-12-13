import { ApolloLink, DocumentNode, Observable, Operation, FetchResult } from 'apollo-link';
import { removeClientSetsFromDocument } from 'apollo-utilities';
import { print } from 'graphql/language/printer';
import { RequestHandler, RequestHandlerResponse } from './mockClient';

type RequestHandlerOptions = {
  replace?: boolean;
};

export class MockLink extends ApolloLink {
  private requestHandlers: Record<string, RequestHandler> = {};

  setRequestHandler(requestQuery: DocumentNode, handler: RequestHandler, options: RequestHandlerOptions = {}): void {
    const key = requestToKey(requestQuery);

    if (this.requestHandlers[key] && !options.replace) {
      throw new Error(`Request handler already defined for query: ${print(requestQuery)}. You can replace this handler with the 'replace' option`);
    }

    this.requestHandlers[key] = handler;
  }

  request(operation: Operation) {
    const key = requestToKey(operation.query);

    const handler = this.requestHandlers[key];

    if (!handler) {
      throw new Error(`Request handler not defined for query: ${print(operation.query)}`);
    }

    let resultPromise: Promise<RequestHandlerResponse<any>> | undefined = undefined;

    try {
      resultPromise = handler(operation.variables);
    } catch (error) {
      throw new Error(`Unexpected error whilst calling request handler: ${error.message}`);
    }

    if (!isPromise(resultPromise)) {
      throw new Error(`Request handler must return a promise. Received '${typeof resultPromise}'.`);
    }

    return new Observable<FetchResult>(observer => {
      resultPromise!
        .then((result) => {
          observer.next(result);
          observer.complete();
        })
        .catch((error) => {
          observer.error(error);
        });
      return () => {};
    });
  }
}

function requestToKey(requestQuery: DocumentNode): string {
  const query = removeClientSetsFromDocument(requestQuery);
  const queryString = query && print(query);
  const requestKey = { query: queryString };
  return JSON.stringify(requestKey);
}

function isPromise(maybePromise: any): maybePromise is Promise<any> {
  return maybePromise && typeof (maybePromise as any).then === 'function';
}
