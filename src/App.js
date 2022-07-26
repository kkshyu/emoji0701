import {
  ApolloClient,
  InMemoryCache,
  ApolloProvider,
  gql,
} from "@apollo/client";
import dayjs from "dayjs";
import Cookies from "js-cookie";
import { useEffect, useMemo, useState } from "react";
import "./App.css";

function App() {
  const [secret, setSecret] = useState(Cookies.get("secret") || null);

  useEffect(() => {
    secret
      ? Cookies.set("secret", secret, { expires: 30 })
      : Cookies.remove("secret");
  }, [secret]);

  return (
    <div className="App">
      <header className="App-header">
        {secret ? (
          <MainSection secret={secret} onLogout={() => setSecret(null)} />
        ) : (
          <LoginSection onLogin={(secret) => setSecret(secret)}></LoginSection>
        )}
      </header>
    </div>
  );
}

const LoginSection = ({ onLogin }) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(e.target.elements.secret.value);
  };
  return (
    <form onSubmit={handleSubmit}>
      <div className="ts-input is-large">
        <input
          type="password"
          name="secret"
          placeholder="請輸入管理金鑰"
          autoFocus
          required
        />
      </div>
      <div>
        <button className="ts-button is-fluid" type="submit">
          登入
        </button>
      </div>
    </form>
  );
};

const MainSection = ({ secret, onLogout }) => {
  const [orders, setOrders] = useState([]);
  const [memberPoints, setMemberPoints] = useState([]);
  const searchParams = new URLSearchParams(window.location.search);
  const memberId = searchParams.get("id");
  const client = useMemo(
    () =>
      new ApolloClient({
        uri: "https://emoji0701.hasura.app/v1/graphql",
        headers: {
          "x-hasura-admin-secret": secret,
        },
        cache: new InMemoryCache(),
      }),
    [secret]
  );
  useEffect(() => {
    client
      .query({
        query: gql`
          query GET_MEMBER_POINTS($memberId: String!) {
            order(
              where: {
                order_member_points: {
                  member_point: { member_id: { _eq: $memberId } }
                }
              }
            ) {
              title
              order_member_points_aggregate {
                aggregate {
                  sum {
                    points
                  }
                }
              }
            }
            member_point(
              where: { member_id: { _eq: $memberId } }
              order_by: [{ ended_at: asc }]
            ) {
              id
              ended_at
              points
              order_member_points_aggregate {
                aggregate {
                  sum {
                    points
                  }
                }
              }
            }
          }
        `,
        variables: { memberId },
      })
      .then(({ data }) => {
        setOrders(
          data?.order?.map((v) => ({
            title: v.title,
            usedPoints: v.order_member_points_aggregate?.aggregate?.sum?.points || 0,
            createdAt: dayjs(v.createdAt),
          }))
        );
        setMemberPoints(
          data?.member_point?.map((v) => ({
            id: v.id,
            endedAt: v.ended_at,
            points: v.points,
            usedPoints:
              v.order_member_points_aggregate?.aggregate?.sum?.points || 0,
          })) || []
        );
      });
  }, [client, setMemberPoints]);
  const handleSubmit = (e) => {
    e.preventDefault();
    const title = e.target.elements.title.value || "";
    const addedPoints = Number(e.target.elements.points.value) || 0;
    const endedAt = e.target.elements.endedAt.value
      ? dayjs(e.target.elements.endedAt.value).endOf("day")
      : dayjs().endOf("day");

    if (
      window.confirm(
        `你確定要新增/扣除 ${Math.abs(addedPoints)} 點（${
          endedAt ? endedAt.format("YYYY/MM/DD到期") : "即刻到期"
        } ）？`
      )
    ) {
      if (addedPoints < 0) {
        let minusPoints = -addedPoints;
        const orderMemberPointsInput = [];
        for (const memberPoint of memberPoints) {
          if (minusPoints > 0 && memberPoint.points > memberPoint.usedPoints) {
            const usedPoints = Math.min(
              minusPoints,
              memberPoint.points - memberPoint.usedPoints
            );
            orderMemberPointsInput.push({
              member_point_id: memberPoint.id,
              points: usedPoints,
            });
            minusPoints -= usedPoints;
          }
        }
        if (minusPoints > 0) {
          alert("點數不足");
        } else {
          client
            .mutate({
              mutation: gql`
                mutation INSERT_ORDER(
                  $title: String!
                  $orderMemberPointsInput: [order_member_point_insert_input!]!
                ) {
                  insert_order_one(
                    object: {
                      title: $title
                      order_member_points: { data: $orderMemberPointsInput }
                    }
                  ) {
                    id
                  }
                }
              `,
              variables: {
                title,
                orderMemberPointsInput,
              },
            })
            .then(() => window.location.reload());
        }
      } else {
        client
          .mutate({
            mutation: gql`
              mutation INSERT_MEMBER_POINT(
                $title: String!
                $memberId: String!
                $endedAt: timestamptz
                $points: Int!
              ) {
                insert_member_point_one(
                  object: {
                    title: $title
                    member_id: $memberId
                    ended_at: $endedAt
                    points: $point
                  }
                ) {
                  id
                }
              }
            `,
            variables: {
              title,
              memberId,
              endedAt,
              points: addedPoints,
            },
          })
          .then(() => window.location.reload());
      }
    }
  };
  const currentPoints = memberPoints
    .filter((memberPoint) => dayjs(memberPoint.endedAt) >= dayjs())
    .reduce(
      (accum, memberPoint) =>
        accum + memberPoint.points - memberPoint.usedPoints,
      0
    );
  return (
    <form onSubmit={handleSubmit}>
      <div className="ts-segment">目前點數：{currentPoints}</div>
      <div className="ts-space"></div>
      <div className="ts-input is-large is-fluid">
        <input
          type="text"
          name="title"
          placeholder="三杯酒、會員禮、員工福利等"
          autoFocus
          required
        />
      </div>
      <div className="ts-space"></div>
      <div className="ts-input is-large is-fluid">
        <input type="number" name="points" placeholder="調整點數" required />
      </div>
      <div className="ts-space"></div>
      <div className="ts-input is-large is-fluid">
        <input type="date" name="endedAt" placeholder="結束日期" />
      </div>
      <div className="ts-space"></div>
      <div>
        <button className="ts-button is-fluid" type="submit">
          送出
        </button>
      </div>
      <div className="ts-space"></div>
      <button
        className="ts-button is-outlined is-fluid"
        type="button"
        onClick={onLogout}
      >
        登出
      </button>
      <div className="ts-space"></div>

      <div className="ts-list">
        {memberPoints.map((memberPoint, idx) => (
          <div key={idx} className="item">
            {memberPoint.points} 點：
            <span>{dayjs(memberPoint.endedAt).format("YYYY/MM/DD")} 到期</span>
            <span>（已使用 {memberPoint.usedPoints}）</span>
          </div>
        ))}
      </div>
      <div className="ts-space"></div>

      <div className="ts-list">
        {orders.map((order, idx) => (
          <div key={idx} className="item">
            <span>{order.title}：</span>
            <span>{order.createdAt.format("YYYY/MM/DD")}</span>
            使用 {order.usedPoints} 點
          </div>
        ))}
      </div>
    </form>
  );
};

export default App;
