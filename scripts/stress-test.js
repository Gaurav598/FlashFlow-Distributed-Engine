import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 }, 
    { duration: '1m',  target: 100 },
    { duration: '30s', target: 200 }, 
  ],
};

export default function () {
//   const url = 'http://host.docker.internal:3000/api/v1/auth/register';
//   const url = 'http://host.docker.internal:3000/api/v1/stock/current';
  const url = 'http://host.docker.internal:3000/api/v1/orders/create';
  
  const payload = JSON.stringify({
    productId: "item:1",
    quantity: 1
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2YTRkMGY4NWMxMzQyY2Q0MjgzMTNmNTgiLCJlbWFpbCI6InRlc3RAdGVzdC5jb20iLCJ1c2VybmFtZSI6InRlc3R1c2VyIiwiaWF0IjoxNzgzNDM3NzE5LCJleHAiOjE3ODM1MjQxMTl9.oiXjICc4CrUsr-6M6rgxvmbX2ws3_m7adVdzbAZSjdw'
    },
  };

  http.post(url, payload, params);
  sleep(1);
}