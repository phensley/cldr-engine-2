# Objective

This project is a prototype to develop and test a technique to refactor a large class-oriented Typescript library to be tree-shakable.

The main barrier to tree-shaking the library as it stands is the extensive use of classes with many methods. These methods pull in huge volumes of code which the bundler has no way of eliminating.

There are two novel techniques being explored in this library:

1. Dynamic extension of Typescript classes (in a tree-shakable manner)
2. Access to truly private "inner" objects

## Dynamic extension of Typescript classes

This prototype is developing a technique which can dynamically patch new methods into skeletal classes in a typesafe way. If a client wants to add a method to a class, it imports a fragment containing the method that (a) extends the class type definition with the new method signature, and (b) patches the method into the class prototype.

The main drawbacks are (a) the overhead from dynamically patching methods into class prototypes and (b) clients need to add many imports to ensure the top-level public methods they depend on are defined in their bundle.

### Example

A new public class is defined as a skeleton with no public methods:

```typescript
// packages/foo/src/foo.ts

export class Foo {
    constructor(private string name) {}
}
```

To add methods to the class, we define each in its own file. If a method requires another method be defined, it simply imports that method's file and any other imports it depends on.

```typescript
// packages/foo/src/getname.ts

import { Foo } from './foo.js';

declare module './foo.js' {
  interface Foo {
    getname(): string;
  }
}

Foo.prototype.getname = function (self: Foo): string {
  return self.name;
};
```

```typescript
// packages/foo/src/capitalize.ts

import { Foo } from './foo.js';
import './getname.js';

declare module './foo.js' {
  interface Foo {
    capitalize(): Foo;
  }
}

Foo.prototype.capitalize = function (self: Foo): Foo {
  return new Foo(self.getname().toUpperCase());
};
```

A client that wants to use the `capitalize` method must ensure that import is part of its library and the bundler builds it into the final bundle.

```typescript
// packages/exmaple/src/example.ts

import { Foo } from '@foo'; // part of public exports, always defined
import '@foo/capitalize'; // optional functionality

export const dofoo = (name: string): Foo => {
  const foo = new Foo(name);
  return foo.capitalize();
};
```

## Access to truly private "inner" objects

A second technique is to allow a class instance access to private fields scoped to an "inner" object. This inner object can be passed to internal, private code without chance of it being (a) exposed publically due to a property on a runtime Javascript object, or (b) needing to be passed in explicitly by a caller. The public object instance can be associated with another object via a WeakMap, which can be used to fetch internal static data and private objects at runtime.

There are times when a class may want to expose internal data to other related classes without making it accessible via its public interface, or even reachable in some cases. To support this we devise a method to use `WeakMap` to create private associations between public and private objects. We can create a rich set of internal-only objects accessible only via a truly-private association. No method signature changes are required: all that is required is a reference to a public object instance to fetch its private data, fields, etc.

The main drawbacks are (a) runtime overhead due to indirection through the WeakMap, and (b) a bit of code bloat from the dynamic lookups inside each method. Maps are pretty fast, and most of Javascript code is driven by object and map lookups, so the overhead will have to be measured to determine the real-world impact.

```typescript
// packages/decimal/src/decimal.ts

// Has no fields of its own. the instance "points to" a private object holding
// all fields for a public Decimal object
export class Decimal {}
```

```typescript
// stores private fields for all Decimal instances
export const decimalInner = new WeakMap();

export interface DecimalInner {
  data: number[];
  sign: number;
  exp: number;
  flag: number;
}

export const decimalNew = (o: any): DecimalInner => {
  const inner = { data: [], sign: 0, exp: 0, flag: 0 };
  decimalInner.set(o, inner);
  return inner;
};
```

```typescript
// packages/decimal/src/min.ts

declare module './min.js' {
    min(other: Decimal): Decimal;
}

Decimal.prototype.min = function (other: Decimal): Decimal {
    const innerSelf = decimalInner.get(this);
    const innerThis = decimalInner.get(other);
    // return the minimum of `innerSelf` and `innerThis` here
}
```
