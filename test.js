console.log('i m run');
setTimeout(() => console.log('timeout complete'), 0)
Promise.resolve('value').then((v) => console.log("Promise complete ", v));
console.log('End of code');