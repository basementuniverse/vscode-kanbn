import React from "react";

const Header = ({ name, description }) => {
  return (
    <div>
      <h1>{name}</h1>
      <p>
        {description}
      </p>
      <hr />
    </div>
  );
}

export default Header;
