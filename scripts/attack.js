async function attack() {
    const url = 'http://localhost:8000/api/v1/shop/buy';
    const headers = { 'x-user-id': 'attacker_1', 'Content-Type': 'application/json' };
    const body = { productId: '64c9e654e599a81832123456' };

    console.log(" Launching concurrency attack...\n");

    const requests = [];

    for (let i = 0; i < 5; i++) {
        const reqId = i + 1;
        const startTime = Date.now();

        console.log(` [${reqId}] Sent at: ${new Date(startTime).toLocaleString()}`);

        const request = fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
        })
        .then(async res => {
            const endTime = Date.now();
            console.log(` [${reqId}] Completed at: ${new Date(endTime).toLocaleString()} (Δ ${endTime - startTime} ms)`);
            return res;
        })
        .catch(err => {
            const endTime = Date.now();
            console.log(` [${reqId}] Failed at: ${new Date(endTime).toLocaleString()} (Δ ${endTime - startTime} ms)`);
        });

        requests.push(request);
    }

    await Promise.allSettled(requests);

    console.log("\n Attack finished.");
}

attack();
