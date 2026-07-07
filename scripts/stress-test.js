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
//   const url = 'http://localhost/api/v1/auth/register';
//   const url = 'http://localhost/api/v1/stock/current';
  const url = 'http://localhost/api/v1/orders/create';
  
  const uniqueId = Date.now() + Math.random();
  const payload = JSON.stringify({
    username: `user_${uniqueId}`,
    email: `stress_${uniqueId}@test.com`,
    password: "Password123!" // Password hashing spikes the CPU!
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  http.post(url, payload, params);
  sleep(1);
}