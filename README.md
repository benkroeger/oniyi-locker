[![NPM info](https://nodei.co/npm/oniyi-locker.png?downloads=true)](https://nodei.co/npm/oniyi-locker.png?downloads=true)

[![dependencies](https://david-dm.org/benkroeger/oniyi-locker.png)](https://david-dm.org/benkroeger/oniyi-locker.png)

> Lock and unlock resources based on redis keys.

This module allows you to lock and unlock resources. It uses redis to store locks and also expire them.
When trying to aquire a lock on an already locked resource, the client can subscribe to an unlock event to get notified as soon as the resource was released.
Releasing a resource is restricted to those owning a resource specific key.

## Install

```sh
$ npm install --save oniyi-locker
```

## Usage
coming soon!

## License

MIT © [Benjamin Kroeger]()


[npm-image]: https://badge.fury.io/js/oniyi-locker.svg
[npm-url]: https://npmjs.org/package/oniyi-locker
